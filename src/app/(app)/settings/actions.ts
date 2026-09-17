"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { dbErrorMessage } from "@/lib/supabase/friendlyDbError";
import type { IngredientPriceTaxMode } from "@/lib/taxMode.ts";

/**
 * 店舗設定(店名・目標原価率・税表示モード)を保存する。
 *
 * 家賃・人件費・ロス値引き額はいずれも月次でFL比率画面から入力する運用に
 * 一本化しているため、ここでは扱わない(以前は家賃だけここでも入力できたが、
 * 「どこで何を入力するか」が分かりにくいという指摘を受けて廃止した)。
 */
export interface SaveStoreSettingsInput {
  storeId: string;
  name: string;
  defaultTargetCostRate: number;
  /** 仕入単価を税込・税抜のどちらで入力しているか(ラベル表示のみに使う。計算式は変えない) */
  ingredientPriceTaxMode: IngredientPriceTaxMode;
}

export type SaveStoreSettingsResult = { success: true } | { success: false; error: string };

export async function saveStoreSettings(input: SaveStoreSettingsInput): Promise<SaveStoreSettingsResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const name = input.name.trim();
  if (!name) return { success: false, error: "店舗名を入力してください" };
  if (
    !Number.isFinite(input.defaultTargetCostRate) ||
    input.defaultTargetCostRate <= 0 ||
    input.defaultTargetCostRate > 100
  ) {
    return { success: false, error: "目標原価率は0より大きく100以下の数値で入力してください" };
  }

  const { error: storeError } = await supabase
    .from("stores")
    .update({
      name,
      default_target_cost_rate: input.defaultTargetCostRate,
      ingredient_price_tax_mode: input.ingredientPriceTaxMode,
    })
    .eq("id", input.storeId);
  if (storeError) return { success: false, error: dbErrorMessage("店舗情報の保存", storeError) };

  return { success: true };
}
