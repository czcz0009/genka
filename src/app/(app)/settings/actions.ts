"use server";

import { monthToPeriod } from "@/lib/period/month";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { dbErrorMessage } from "@/lib/supabase/friendlyDbError";
import type { IngredientPriceTaxMode } from "@/lib/taxMode.ts";

/**
 * 店舗設定(店名・目標原価率・家賃)をまとめて1回の保存で反映する。
 * 家賃は空欄なら「変更しない」扱いにする(未入力=クリアではなく、
 * 触っていない項目は既存の値をそのまま残す方が安全で分かりやすいため)。
 *
 * 人件費は月ごとに金額が変わるため、ここでは扱わない(FL比率画面で
 * 月を選んで入力する運用に一本化している。「設定」に月次の値を置くと、
 * 一度きりの設定のように見えて紛らわしいという指摘を受けての変更)。
 */
export interface SaveStoreSettingsInput {
  storeId: string;
  name: string;
  defaultTargetCostRate: number;
  /** nullなら変更しない */
  rentAmount: number | null;
  /** 家賃を適用する対象月("YYYY-MM") */
  month: string;
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

  const { start } = monthToPeriod(input.month);

  if (input.rentAmount != null) {
    if (!Number.isFinite(input.rentAmount) || input.rentAmount < 0) {
      return { success: false, error: "家賃は0以上の数値で入力してください" };
    }
    const { error } = await supabase.from("store_fixed_costs").upsert(
      { store_id: input.storeId, cost_type: "rent", amount: input.rentAmount, period_start: start, period_end: null },
      { onConflict: "store_id,cost_type,period_start" },
    );
    if (error) return { success: false, error: dbErrorMessage("家賃の保存", error) };
  }

  return { success: true };
}
