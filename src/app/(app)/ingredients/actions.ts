"use server";

import { normalizeDisplayName, normalizeForDedupe, validateNameLength } from "@/lib/normalize";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { friendlyDbError, dbErrorMessage } from "@/lib/supabase/friendlyDbError";

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

  const { error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", input.ingredientId)
    .eq("store_id", input.storeId);
  if (error) return { success: false, error: dbErrorMessage("食材の削除", error) };
  return { success: true };
}
