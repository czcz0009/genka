"use server";

import { createClient } from "@/lib/supabase/server";
import { monthToPeriod } from "@/lib/period/month";
import type { FixedCostType } from "@/lib/flRatio";

export interface SaveFixedCostInput {
  storeId: string;
  costType: FixedCostType;
  month: string;
  amount: number;
}

export type SaveFixedCostResult = { success: true } | { success: false; error: string };

/**
 * 固定費(家賃・人件費)を保存する。
 * - labor(人件費): その月だけに適用される値として period_start/period_end を月初/月末で保存する。
 * - rent(家賃): 「その月から適用され、変更されるまで続く」値として period_end は null(継続中)にする。
 *   同じ月に対して再度保存すれば、その月の値を上書き更新するだけ(store_fixed_costsの
 *   unique(store_id, cost_type, period_start)により、月ごとに1行に定まる)。
 */
export async function saveFixedCost(input: SaveFixedCostInput): Promise<SaveFixedCostResult> {
  const supabase = await createClient();
  if (!supabase) return { success: false, error: "Supabaseが未設定です" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインが必要です" };

  const { start, end } = monthToPeriod(input.month);
  const { error } = await supabase.from("store_fixed_costs").upsert(
    {
      store_id: input.storeId,
      cost_type: input.costType,
      amount: input.amount,
      period_start: start,
      period_end: input.costType === "labor" ? end : null,
    },
    { onConflict: "store_id,cost_type,period_start" },
  );
  if (error) return { success: false, error: `固定費の保存に失敗しました: ${error.message}` };
  return { success: true };
}
