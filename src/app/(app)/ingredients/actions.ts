"use server";

import { normalizeDisplayName, normalizeForDedupe, validateNameLength } from "@/lib/normalize";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { friendlyDbError, dbErrorMessage } from "@/lib/supabase/friendlyDbError";
import { wouldCreateCycle } from "@/lib/prepItemCost";

/**
 * 食材の単独登録・編集(メニュー登録画面を経由しない、食材だけの追加・編集)。
 *
 * 「メニュー追加の時にしか食材を追加できず不便」という指摘を受けて新設した
 * 「食材」画面から使う。メニュー登録画面(menus/actions.ts)の食材追加ロジックと
 * 同じ規約(表記ゆれの正規化・重複防止・価格変更履歴への記録)を踏襲している。
 *
 * 単位(unit)は編集画面からは変更できない設計にしている。既存メニューの
 * レシピ行(menu_ingredients.quantity)はこの食材の単位を前提にした数値のため、
 * 単位だけ後から変えると全メニューの原価計算が実際には変わっていないのに
 * 数値上変わってしまう(例: gの分量のままkg扱いになる)。これを避けるため、
 * 単位を変えたい場合は新しい食材として登録し直す運用にする。
 */

export interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
  /** 歩留まり率(%)。100(既定)なら歩留まりなし。 */
  yieldRatePercent: number;
  /** 仕込み品(サブレシピ)かどうか。 */
  isPrepItem: boolean;
  /** 仕込み品の場合のみ使う。1回の仕込みでできる量(unitと同じ単位)。 */
  yieldQuantity: number | null;
  /** 仕込み品の場合のみ使う。レシピ明細(表示・編集用)。 */
  components?: { componentId: string; componentName: string; componentUnit: string; quantity: number }[];
}

export interface CreateIngredientInput {
  storeId: string;
  name: string;
  unit: string;
  purchasePrice: number;
  /** 歩留まり率(%)。未指定なら100(歩留まりなし)。 */
  yieldRatePercent?: number;
}

export type CreateIngredientResult = { success: true; ingredient: IngredientRow } | { success: false; error: string };

export async function createIngredient(input: CreateIngredientInput): Promise<CreateIngredientResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "食材名を入力してください" };
  const nameLengthError = validateNameLength(name, "食材名");
  if (nameLengthError) return { success: false, error: nameLengthError };
  if (!input.unit.trim()) return { success: false, error: "単位を入力してください" };
  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0) {
    return { success: false, error: "仕入単価は0以上の数値で入力してください" };
  }
  const yieldRatePercent = input.yieldRatePercent ?? 100;
  if (!Number.isFinite(yieldRatePercent) || yieldRatePercent <= 0 || yieldRatePercent > 100) {
    return { success: false, error: "歩留まり率は0より大きく100以下の数値で入力してください" };
  }

  const normalizedName = normalizeForDedupe(name);
  const { data: existing, error: existingErr } = await supabase
    .from("ingredients")
    .select("id")
    .eq("store_id", input.storeId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();
  if (existingErr) return { success: false, error: dbErrorMessage("確認", existingErr) };
  if (existing) return { success: false, error: "同じ名前の食材がすでに登録されています" };

  const nowIso = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("ingredients")
    .insert({
      store_id: input.storeId,
      name: normalizeDisplayName(name),
      normalized_name: normalizedName,
      unit: input.unit.trim(),
      current_purchase_price: input.purchasePrice,
      yield_rate_percent: yieldRatePercent,
      price_updated_at: nowIso,
    })
    .select("id, name, unit, current_purchase_price, yield_rate_percent")
    .single();
  if (error || !created) {
    return {
      success: false,
      error: `食材の登録に失敗しました: ${friendlyDbError(error, "同じ名前の食材がすでに登録されています")}`,
    };
  }

  await supabase
    .from("ingredient_price_history")
    .insert({ ingredient_id: created.id, price: input.purchasePrice, recorded_at: nowIso });

  return {
    success: true,
    ingredient: {
      id: created.id,
      name: created.name,
      unit: created.unit,
      currentPurchasePrice: created.current_purchase_price,
      yieldRatePercent: created.yield_rate_percent,
      isPrepItem: false,
      yieldQuantity: null,
    },
  };
}

export interface UpdateIngredientInput {
  storeId: string;
  ingredientId: string;
  name: string;
  purchasePrice: number;
  /** 歩留まり率(%)。未指定なら100(歩留まりなし)。 */
  yieldRatePercent?: number;
}

export type UpdateIngredientResult = { success: true } | { success: false; error: string };

export async function updateIngredient(input: UpdateIngredientInput): Promise<UpdateIngredientResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "食材名を入力してください" };
  const nameLengthError = validateNameLength(name, "食材名");
  if (nameLengthError) return { success: false, error: nameLengthError };
  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0) {
    return { success: false, error: "仕入単価は0以上の数値で入力してください" };
  }
  const yieldRatePercent = input.yieldRatePercent ?? 100;
  if (!Number.isFinite(yieldRatePercent) || yieldRatePercent <= 0 || yieldRatePercent > 100) {
    return { success: false, error: "歩留まり率は0より大きく100以下の数値で入力してください" };
  }

  const normalizedName = normalizeForDedupe(name);
  const { data: conflict, error: conflictErr } = await supabase
    .from("ingredients")
    .select("id")
    .eq("store_id", input.storeId)
    .eq("normalized_name", normalizedName)
    .neq("id", input.ingredientId)
    .maybeSingle();
  if (conflictErr) return { success: false, error: dbErrorMessage("確認", conflictErr) };
  if (conflict) return { success: false, error: "同じ名前の食材が他に登録されています" };

  const { data: current, error: currentErr } = await supabase
    .from("ingredients")
    .select("current_purchase_price")
    .eq("id", input.ingredientId)
    .single();
  if (currentErr) return { success: false, error: dbErrorMessage("確認", currentErr) };

  const priceChanged = current.current_purchase_price !== input.purchasePrice;
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("ingredients")
    .update({
      name: normalizeDisplayName(name),
      normalized_name: normalizedName,
      current_purchase_price: input.purchasePrice,
      yield_rate_percent: yieldRatePercent,
      ...(priceChanged ? { price_updated_at: nowIso } : {}),
    })
    .eq("id", input.ingredientId);
  if (error) {
    return {
      success: false,
      error: `食材の更新に失敗しました: ${friendlyDbError(error, "同じ名前の食材が他に登録されています")}`,
    };
  }

  // 仕入単価が実際に変わった時だけ履歴に記録する(①のCSV取り込みと同じ規約)
  if (priceChanged) {
    await supabase
      .from("ingredient_price_history")
      .insert({ ingredient_id: input.ingredientId, price: input.purchasePrice, recorded_at: nowIso });
  }

  return { success: true };
}

export interface DeleteIngredientInput {
  storeId: string;
  ingredientId: string;
}

export type DeleteIngredientResult = { success: true } | { success: false; error: string };

/**
 * 食材を1件削除する。
 *
 * 配布前QAで発見した懸念への対応: ingredients.id は menu_ingredients.ingredient_id から
 * on delete cascade で参照されているため(0001_init.sql)、何も考えずに削除すると
 * 使用中のメニューのレシピ行が無警告で消え、原価計算が静かに壊れてしまう。
 * これを避けるため、削除前に使用中のメニューが無いか確認し、1件でもあれば
 * 削除自体を拒否する(「警告してから削除」ではなく「防ぐ」設計)。
 * 取り消せない操作のため、呼び出し側(IngredientsView.tsx)で確認ダイアログを
 * 挟んでから呼ぶこと。
 */
export async function deleteIngredient(input: DeleteIngredientInput): Promise<DeleteIngredientResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const { data: usedIn, error: usedInErr } = await supabase
    .from("menu_ingredients")
    .select("menus(name)")
    .eq("ingredient_id", input.ingredientId);
  if (usedInErr) return { success: false, error: dbErrorMessage("確認", usedInErr) };

  if (usedIn && usedIn.length > 0) {
    const menuNames = Array.from(
      new Set(
        usedIn
          .map((r) => (r.menus as unknown as { name: string } | null)?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    );
    const label =
      menuNames.length > 0
        ? menuNames.slice(0, 3).join("・") + (menuNames.length > 3 ? ` 他${menuNames.length - 3}件` : "")
        : `${usedIn.length}件のメニュー`;
    return {
      success: false,
      error: `この食材は「${label}」で使われているため削除できません。先にメニューからこの食材を外してから削除してください。`,
    };
  }

  // 仕込み品の材料として使われている場合も同様に削除を防ぐ(こちらは通常の食材・
  // 仕込み品のどちらを削除しようとした場合でも起こりうるチェック)。
  const { data: usedInPrepItems, error: usedInPrepItemsErr } = await supabase
    .from("prep_item_components")
    .select("ingredients!prep_item_components_prep_item_id_fkey(name)")
    .eq("component_id", input.ingredientId);
  if (usedInPrepItemsErr) return { success: false, error: dbErrorMessage("確認", usedInPrepItemsErr) };

  if (usedInPrepItems && usedInPrepItems.length > 0) {
    const prepItemNames = Array.from(
      new Set(
        usedInPrepItems
          .map((r) => (r.ingredients as unknown as { name: string } | null)?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    );
    const label =
      prepItemNames.length > 0
        ? prepItemNames.slice(0, 3).join("・") + (prepItemNames.length > 3 ? ` 他${prepItemNames.length - 3}件` : "")
        : `${usedInPrepItems.length}件の仕込み品`;
    return {
      success: false,
      error: `この食材は仕込み品「${label}」の材料として使われているため削除できません。先に仕込み品からこの食材を外してから削除してください。`,
    };
  }

  const { error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", input.ingredientId)
    .eq("store_id", input.storeId);
  if (error) return { success: false, error: dbErrorMessage("食材の削除", error) };
  return { success: true };
}

export interface SavePrepItemComponentInput {
  componentId: string;
  quantity: number;
  /** その材料(componentId)自身の単位(例: "g")。メニュー編集画面のレシピ行と同じ規約。 */
  unit: string;
}

export interface SavePrepItemInput {
  storeId: string;
  /** 未指定 = 新規作成。指定 = 既存の仕込み品を更新する */
  prepItemId?: string;
  name: string;
  /** メニューがこの仕込み品を使う時の単位(例: "ml") */
  unit: string;
  /** 1回の仕込みでできる量(unitと同じ単位、例: 10000) */
  yieldQuantity: number;
  components: SavePrepItemComponentInput[];
}

export type SavePrepItemResult = { success: true; prepItemId: string } | { success: false; error: string };

/**
 * 仕込み品(サブレシピ)を1件、名前・仕込み量・レシピ明細まとめて保存する。
 * saveMenuWithIngredients(menus/actions.ts)と同じ「保存ボタンを押した瞬間に
 * まとめて1回だけ送る」設計。レシピ明細は毎回すべて置き換える(削除→挿入)。
 *
 * 循環参照の防止: 更新時のみ、店舗内の他の仕込み品どうしの参照関係を全件読み、
 * この仕込み品の新しいレシピを反映した場合に自分自身に戻ってきてしまわないかを
 * 検査する(新規作成時は、まだ存在しないためどの仕込み品からも参照されようが
 * なく、循環が起こり得ない)。
 */
export async function savePrepItem(input: SavePrepItemInput): Promise<SavePrepItemResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "仕込み品名を入力してください" };
  const nameLengthError = validateNameLength(name, "仕込み品名");
  if (nameLengthError) return { success: false, error: nameLengthError };
  if (!input.unit.trim()) return { success: false, error: "単位を入力してください" };
  if (!Number.isFinite(input.yieldQuantity) || input.yieldQuantity <= 0) {
    return { success: false, error: "1回の仕込みでできる量は0より大きい数値で入力してください" };
  }
  if (input.components.length === 0) {
    return { success: false, error: "材料を1つ以上追加してください" };
  }
  for (const c of input.components) {
    if (!Number.isFinite(c.quantity) || c.quantity <= 0) {
      return { success: false, error: "材料の分量は0より大きい数値で入力してください" };
    }
    if (!c.unit.trim()) {
      return { success: false, error: "材料の単位を入力してください" };
    }
  }

  if (input.prepItemId) {
    const { data: allEdges, error: edgesErr } = await supabase
      .from("prep_item_components")
      .select("prep_item_id, component_id")
      .neq("prep_item_id", input.prepItemId);
    if (edgesErr) return { success: false, error: dbErrorMessage("確認", edgesErr) };

    const existingEdges = (allEdges ?? []).map((e) => ({ prepItemId: e.prep_item_id, componentId: e.component_id }));
    const newComponentIds = input.components.map((c) => c.componentId);
    if (wouldCreateCycle(input.prepItemId, newComponentIds, existingEdges)) {
      return {
        success: false,
        error: "この材料構成にすると仕込み品同士が循環参照してしまうため保存できません(例: AがBを含み、BがAを含む形)",
      };
    }
  }

  const normalizedName = normalizeForDedupe(name);
  let prepItemId = input.prepItemId;

  if (prepItemId) {
    const { data: conflict, error: conflictErr } = await supabase
      .from("ingredients")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("normalized_name", normalizedName)
      .neq("id", prepItemId)
      .maybeSingle();
    if (conflictErr) return { success: false, error: dbErrorMessage("確認", conflictErr) };
    if (conflict) return { success: false, error: "同じ名前の食材・仕込み品が他に登録されています" };

    const { error: updateErr } = await supabase
      .from("ingredients")
      .update({
        name: normalizeDisplayName(name),
        normalized_name: normalizedName,
        unit: input.unit.trim(),
        yield_quantity: input.yieldQuantity,
      })
      .eq("id", prepItemId)
      .eq("store_id", input.storeId);
    if (updateErr) return { success: false, error: dbErrorMessage("仕込み品の更新", updateErr) };

    const { error: deleteErr } = await supabase.from("prep_item_components").delete().eq("prep_item_id", prepItemId);
    if (deleteErr) return { success: false, error: dbErrorMessage("材料構成の更新", deleteErr) };
  } else {
    const { data: existing, error: existingErr } = await supabase
      .from("ingredients")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (existingErr) return { success: false, error: dbErrorMessage("確認", existingErr) };
    if (existing) return { success: false, error: "同じ名前の食材・仕込み品がすでに登録されています" };

    const { data: created, error: createErr } = await supabase
      .from("ingredients")
      .insert({
        store_id: input.storeId,
        name: normalizeDisplayName(name),
        normalized_name: normalizedName,
        unit: input.unit.trim(),
        current_purchase_price: 0, // 仕込み品は使わない(レシピからその場で計算するため)
        is_prep_item: true,
        yield_quantity: input.yieldQuantity,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return {
        success: false,
        error: `仕込み品の登録に失敗しました: ${friendlyDbError(createErr, "同じ名前の食材・仕込み品がすでに登録されています")}`,
      };
    }
    prepItemId = created.id;
  }

  const { error: insertErr } = await supabase.from("prep_item_components").insert(
    input.components.map((c) => ({
      prep_item_id: prepItemId,
      component_id: c.componentId,
      quantity: c.quantity,
      unit: c.unit,
    })),
  );
  if (insertErr) return { success: false, error: dbErrorMessage("材料構成の保存", insertErr) };

  return { success: true, prepItemId: prepItemId! };
}
