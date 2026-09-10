"use server";

import { createClient } from "@/lib/supabase/server";
import type { ChikusanItemCode } from "@/lib/marketPrices/livestock/chikusanColumns";

export type SaveLinkResult = { success: true } | { success: false; error: string };

/**
 * 食材と畜産物規格の紐付けを、店主が明示的に確定させる。
 * (青果物と違い自動マッチングはしない方針— src/lib/marketPrices/livestock/README参照)
 */
export async function saveIngredientMarketLink(input: {
  ingredientId: string;
  itemCode: ChikusanItemCode;
}): Promise<SaveLinkResult> {
  const supabase = await createClient();
  if (!supabase) return { success: false, error: "Supabaseが未設定です" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインが必要です" };

  const { error } = await supabase.from("ingredient_market_links").upsert(
    { ingredient_id: input.ingredientId, source: "chikusan", item_code: input.itemCode },
    { onConflict: "ingredient_id,source" },
  );
  if (error) return { success: false, error: `保存に失敗しました: ${error.message}` };
  return { success: true };
}

export async function clearIngredientMarketLink(input: { ingredientId: string }): Promise<SaveLinkResult> {
  const supabase = await createClient();
  if (!supabase) return { success: false, error: "Supabaseが未設定です" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインが必要です" };

  const { error } = await supabase
    .from("ingredient_market_links")
    .delete()
    .eq("ingredient_id", input.ingredientId)
    .eq("source", "chikusan");
  if (error) return { success: false, error: `解除に失敗しました: ${error.message}` };
  return { success: true };
}
