"use server";

import { monthToPeriod } from "@/lib/period/month";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";

/**
 * 店舗設定(店名・目標原価率・家賃・当月の人件費)をまとめて1回の保存で反映する。
 * 家賃・人件費は空欄なら「変更しない」扱いにする(未入力=クリアではなく、
 * 触っていない項目は既存の値をそのまま残す方が安全で分かりやすいため)。
 */
export interface SaveStoreSettingsInput {
  storeId: string;
  name: string;
  defaultTargetCostRate: number;
  /** nullなら変更しない */
  rentAmount: number | null;
  /** nullなら変更しない */
  laborAmount: number | null;
  /** 人件費を適用する対象月("YYYY-MM") */
  month: string;
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
    .update({ name, default_target_cost_rate: input.defaultTargetCostRate })
    .eq("id", input.storeId);
  if (storeError) return { success: false, error: `店舗情報の保存に失敗しました: ${storeError.message}` };

  const { start, end } = monthToPeriod(input.month);

  if (input.rentAmount != null) {
    if (!Number.isFinite(input.rentAmount) || input.rentAmount < 0) {
      return { success: false, error: "家賃は0以上の数値で入力してください" };
    }
    const { error } = await supabase.from("store_fixed_costs").upsert(
      { store_id: input.storeId, cost_type: "rent", amount: input.rentAmount, period_start: start, period_end: null },
      { onConflict: "store_id,cost_type,period_start" },
    );
    if (error) return { success: false, error: `家賃の保存に失敗しました: ${error.message}` };
  }

  if (input.laborAmount != null) {
    if (!Number.isFinite(input.laborAmount) || input.laborAmount < 0) {
      return { success: false, error: "人件費は0以上の数値で入力してください" };
    }
    const { error } = await supabase.from("store_fixed_costs").upsert(
      { store_id: input.storeId, cost_type: "labor", amount: input.laborAmount, period_start: start, period_end: end },
      { onConflict: "store_id,cost_type,period_start" },
    );
    if (error) return { success: false, error: `人件費の保存に失敗しました: ${error.message}` };
  }

  return { success: true };
}
