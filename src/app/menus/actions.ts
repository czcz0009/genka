"use server";

import { normalizeDisplayName, normalizeForDedupe } from "@/lib/normalize";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";

/**
 * 手入力でのメニュー・食材登録(CSVを持たないユーザー向けのオンボーディング動線)。
 * ①のCSV取り込みと同じ「正規化名で重複を防ぐ」設計をそのまま踏襲する
 * (同じ店舗で同じ名前のメニュー・食材を手入力とCSVの両方から登録しても、
 * 別々のレコードとして重複しないように)。
 */

export type CreateMenuResult = { success: true; menuId: string } | { success: false; error: string };

export async function createMenu(input: {
  storeId: string;
  name: string;
  sellingPrice: number | null;
}): Promise<CreateMenuResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "メニュー名を入力してください" };
  const normalizedName = normalizeForDedupe(name);

  // 同じ名前のメニューが既にあれば、新規作成せずそれを使う(売価だけ指定があれば更新する)
  const { data: existing, error: existingError } = await supabase
    .from("menus")
    .select("id, selling_price")
    .eq("store_id", input.storeId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();
  if (existingError) return { success: false, error: `確認に失敗しました: ${existingError.message}` };

  if (existing) {
    if (input.sellingPrice != null && input.sellingPrice !== existing.selling_price) {
      await supabase.from("menus").update({ selling_price: input.sellingPrice }).eq("id", existing.id);
    }
    return { success: true, menuId: existing.id };
  }

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
  return { success: true, menuId: data.id };
}

export type UpdateMenuResult = { success: true } | { success: false; error: string };

export async function updateMenuSellingPrice(input: {
  menuId: string;
  sellingPrice: number | null;
}): Promise<UpdateMenuResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { error } = await ctx.supabase.from("menus").update({ selling_price: input.sellingPrice }).eq(
    "id",
    input.menuId,
  );
  if (error) return { success: false, error: `売価の更新に失敗しました: ${error.message}` };
  return { success: true };
}

export interface AddIngredientToMenuInput {
  storeId: string;
  menuId: string;
  quantity: number;
  unit: string;
  /** 既存食材を使う場合はこちらだけ指定する */
  existingIngredientId?: string;
  /** その場で新しい食材を登録する場合はこちら */
  newIngredient?: { name: string; unit: string; purchasePrice: number };
}

export type AddIngredientToMenuResult = { success: true } | { success: false; error: string };

export async function addIngredientToMenu(input: AddIngredientToMenuInput): Promise<AddIngredientToMenuResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { success: false, error: "分量は0より大きい数値で入力してください" };
  }
  if (!input.unit.trim()) {
    return { success: false, error: "単位を入力してください" };
  }

  let ingredientId = input.existingIngredientId;

  if (!ingredientId) {
    if (!input.newIngredient) {
      return { success: false, error: "食材を選ぶか、新しい食材を入力してください" };
    }
    const name = input.newIngredient.name.trim();
    if (!name) return { success: false, error: "食材名を入力してください" };
    if (!input.newIngredient.unit.trim()) return { success: false, error: "食材の単位を入力してください" };
    if (!Number.isFinite(input.newIngredient.purchasePrice) || input.newIngredient.purchasePrice < 0) {
      return { success: false, error: "仕入単価は0以上の数値で入力してください" };
    }
    const normalizedName = normalizeForDedupe(name);

    const { data: existingIngredient, error: existingError } = await supabase
      .from("ingredients")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (existingError) return { success: false, error: `確認に失敗しました: ${existingError.message}` };

    if (existingIngredient) {
      ingredientId = existingIngredient.id;
    } else {
      const nowIso = new Date().toISOString();
      const { data: created, error: createError } = await supabase
        .from("ingredients")
        .insert({
          store_id: input.storeId,
          name: normalizeDisplayName(name),
          normalized_name: normalizedName,
          unit: input.newIngredient.unit,
          current_purchase_price: input.newIngredient.purchasePrice,
          price_updated_at: nowIso,
        })
        .select("id")
        .single();
      if (createError || !created) {
        return { success: false, error: `食材の登録に失敗しました: ${createError?.message ?? "不明なエラー"}` };
      }
      ingredientId = created.id;
      await supabase
        .from("ingredient_price_history")
        .insert({ ingredient_id: ingredientId, price: input.newIngredient.purchasePrice, recorded_at: nowIso });
    }
  }

  const { error: menuIngredientError } = await supabase
    .from("menu_ingredients")
    .upsert(
      { menu_id: input.menuId, ingredient_id: ingredientId, quantity: input.quantity, unit: input.unit },
      { onConflict: "menu_id,ingredient_id" },
    );
  if (menuIngredientError) {
    return { success: false, error: `レシピへの追加に失敗しました: ${menuIngredientError.message}` };
  }
  return { success: true };
}

export async function removeMenuIngredient(input: { menuIngredientId: string }): Promise<AddIngredientToMenuResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { error } = await ctx.supabase.from("menu_ingredients").delete().eq("id", input.menuIngredientId);
  if (error) return { success: false, error: `削除に失敗しました: ${error.message}` };
  return { success: true };
}
