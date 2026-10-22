"use server";

import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/friendlyDbError";
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

  // 1つの食材に紐づけは1つだけ(0026マイグレーションの unique (ingredient_id))。
  // 食材を前提に上書きするので、野菜・果物の確定や「比べない」がある食材でも、食肉の紐づけに置き換わる。
  const { error } = await supabase.from("ingredient_market_links").upsert(
    { ingredient_id: input.ingredientId, source: "chikusan", item_code: input.itemCode },
    { onConflict: "ingredient_id" },
  );
  if (error) return { success: false, error: dbErrorMessage("保存", error) };
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
  if (error) return { success: false, error: dbErrorMessage("解除", error) };
  return { success: true };
}

/** ログイン中のユーザーのSupabaseクライアント(RLSで自分の店舗の食材にしか書き込めない) */
async function authedClient() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabaseが未設定です" } as const;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" } as const;
  return { supabase } as const;
}

/**
 * 野菜・果物の対応づけを、利用者が「これで合っている」と確定させる(2026-10-22、0026マイグレーション)。
 * 推定(確認が必要)だった食材でも、確定させればアラートの対象になる。
 */
export async function saveProduceMarketLink(input: { ingredientId: string; itemCode: string }): Promise<SaveLinkResult> {
  const ctx = await authedClient();
  if ("error" in ctx) return { success: false, error: ctx.error! };
  if (!/^\d{5}$/.test(input.itemCode)) return { success: false, error: "品目の指定が正しくありません" };
  const { error } = await ctx.supabase.from("ingredient_market_links").upsert(
    { ingredient_id: input.ingredientId, source: "syuyo", item_code: input.itemCode },
    { onConflict: "ingredient_id" },
  );
  if (error) return { success: false, error: dbErrorMessage("保存", error) };
  return { success: true };
}

/**
 * 食材を「市場価格と比べない」にする(産直・契約農家など。辞書との一致や推定より優先される)。
 */
export async function excludeIngredientFromMarket(input: { ingredientId: string }): Promise<SaveLinkResult> {
  const ctx = await authedClient();
  if ("error" in ctx) return { success: false, error: ctx.error! };
  const { error } = await ctx.supabase.from("ingredient_market_links").upsert(
    { ingredient_id: input.ingredientId, source: "excluded", item_code: null },
    { onConflict: "ingredient_id" },
  );
  if (error) return { success: false, error: dbErrorMessage("保存", error) };
  return { success: true };
}

/**
 * 野菜・果物の確定、または「比べない」を取り消して、自動の判定(辞書との一致・推定)に戻す。
 * 食肉の紐づけは、畜産物の設定欄の「解除」(clearIngredientMarketLink)で外す。
 */
export async function clearProduceOrExcludedLink(input: { ingredientId: string }): Promise<SaveLinkResult> {
  const ctx = await authedClient();
  if ("error" in ctx) return { success: false, error: ctx.error! };
  const { error } = await ctx.supabase
    .from("ingredient_market_links")
    .delete()
    .eq("ingredient_id", input.ingredientId)
    .in("source", ["syuyo", "excluded"]);
  if (error) return { success: false, error: dbErrorMessage("取り消し", error) };
  return { success: true };
}
