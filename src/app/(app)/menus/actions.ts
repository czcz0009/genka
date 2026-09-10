"use server";

import { normalizeDisplayName, normalizeForDedupe } from "@/lib/normalize";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";

/**
 * メニュー1つ分(メニュー名・売価・食材の行すべて)を1回の保存操作でまとめて
 * 反映するアクション。
 *
 * 以前は「メニューを作成→食材を1つずつ追加(その都度サーバーに保存)」という
 * 2ステップ構成だったが、食材を追加するたびにサーバー往復が発生して
 * 「反応が遅い」「プルダウンで選んでも反映されない(実際は反映まで数百ms
 * かかっていた)」という指摘につながった。そのため、食材の追加・削除・分量変更は
 * すべて画面内のローカルな状態だけで完結させ(ネットワーク往復ゼロ・即座に反映)、
 * 「保存する」を押した瞬間にまとめて1回だけサーバーに送る設計に変更した。
 */

export interface SaveMenuLineInput {
  quantity: number;
  unit: string;
  /** 既存食材を使う場合はこちらだけ指定する */
  existingIngredientId?: string;
  /** その場で新しい食材を登録する場合はこちら */
  newIngredient?: { name: string; unit: string; purchasePrice: number };
}

export interface SaveMenuInput {
  storeId: string;
  /** 未指定 = 新規メニューを作成する。指定 = 既存メニューを更新する */
  menuId?: string;
  name: string;
  sellingPrice: number | null;
  lines: SaveMenuLineInput[];
}

export type SaveMenuResult = { success: true; menuId: string } | { success: false; error: string };

export async function saveMenuWithIngredients(input: SaveMenuInput): Promise<SaveMenuResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "メニュー名を入力してください" };
  const normalizedName = normalizeForDedupe(name);

  let menuId = input.menuId;

  // 既存の食材行(編集モードで、今回の保存で外れた行を後で削除するために先に読んでおく)
  const { data: existingRows } = menuId
    ? await supabase.from("menu_ingredients").select("id, ingredient_id").eq("menu_id", menuId)
    : { data: [] as { id: string; ingredient_id: string }[] };

  if (menuId) {
    const { error } = await supabase
      .from("menus")
      .update({ name: normalizeDisplayName(name), normalized_name: normalizedName, selling_price: input.sellingPrice })
      .eq("id", menuId)
      .eq("store_id", input.storeId);
    if (error) return { success: false, error: `メニューの更新に失敗しました: ${error.message}` };
  } else {
    // 同じ名前のメニューが既にあれば、新規作成せずそれを使う(①のCSV取り込みと同じ重複防止設計)
    const { data: existing, error: existingError } = await supabase
      .from("menus")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (existingError) return { success: false, error: `確認に失敗しました: ${existingError.message}` };

    if (existing) {
      menuId = existing.id;
      await supabase.from("menus").update({ selling_price: input.sellingPrice }).eq("id", menuId);
    } else {
      const { data, error } = await supabase
        .from("menus")
        .insert({
          store_id: input.storeId,
          name: normalizeDisplayName(name),
          normalized_name: normalizedName,
          selling_price: input.sellingPrice,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { success: false, error: `メニューの作成に失敗しました: ${error?.message ?? "不明なエラー"}` };
      }
      menuId = data.id;
    }
  }

  if (!menuId) {
    return { success: false, error: "メニューの特定に失敗しました" };
  }

  const keptIngredientIds = new Set<string>();

  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { success: false, error: "分量は0より大きい数値で入力してください" };
    }
    if (!line.unit.trim()) {
      return { success: false, error: "単位を入力してください" };
    }

    let ingredientId = line.existingIngredientId;

    if (!ingredientId) {
      if (!line.newIngredient) return { success: false, error: "食材を選ぶか、新しい食材を入力してください" };
      const ingName = line.newIngredient.name.trim();
      if (!ingName) return { success: false, error: "食材名を入力してください" };
      if (!line.newIngredient.unit.trim()) return { success: false, error: "食材の単位を入力してください" };
      if (!Number.isFinite(line.newIngredient.purchasePrice) || line.newIngredient.purchasePrice < 0) {
        return { success: false, error: "仕入単価は0以上の数値で入力してください" };
      }
      const ingNormalized = normalizeForDedupe(ingName);

      const { data: existingIngredient, error: existingIngErr } = await supabase
        .from("ingredients")
        .select("id")
        .eq("store_id", input.storeId)
        .eq("normalized_name", ingNormalized)
        .maybeSingle();
      if (existingIngErr) return { success: false, error: `確認に失敗しました: ${existingIngErr.message}` };

      if (existingIngredient) {
        ingredientId = existingIngredient.id;
      } else {
        const nowIso = new Date().toISOString();
        const { data: created, error: createErr } = await supabase
          .from("ingredients")
          .insert({
            store_id: input.storeId,
            name: normalizeDisplayName(ingName),
            normalized_name: ingNormalized,
            unit: line.newIngredient.unit,
            current_purchase_price: line.newIngredient.purchasePrice,
            price_updated_at: nowIso,
          })
          .select("id")
          .single();
        if (createErr || !created) {
          return { success: false, error: `食材の登録に失敗しました: ${createErr?.message ?? "不明なエラー"}` };
        }
        ingredientId = created.id;
        await supabase
          .from("ingredient_price_history")
          .insert({ ingredient_id: ingredientId, price: line.newIngredient.purchasePrice, recorded_at: nowIso });
      }
    }

    if (!ingredientId) {
      return { success: false, error: "食材の特定に失敗しました" };
    }
    keptIngredientIds.add(ingredientId);
    const { error: upsertError } = await supabase
      .from("menu_ingredients")
      .upsert(
        { menu_id: menuId, ingredient_id: ingredientId, quantity: line.quantity, unit: line.unit },
        { onConflict: "menu_id,ingredient_id" },
      );
    if (upsertError) {
      return { success: false, error: `レシピへの追加に失敗しました: ${upsertError.message}` };
    }
  }

  // 編集前は登録されていたが、今回の保存で画面上から削除された食材行を消す
  const rowsToDelete = (existingRows ?? []).filter((r) => !keptIngredientIds.has(r.ingredient_id)).map((r) => r.id);
  if (rowsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from("menu_ingredients").delete().in("id", rowsToDelete);
    if (deleteError) return { success: false, error: `不要な食材の削除に失敗しました: ${deleteError.message}` };
  }

  return { success: true, menuId };
}
