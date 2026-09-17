"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { dbErrorMessage } from "@/lib/supabase/friendlyDbError";

export type CompleteOnboardingResult = { success: true } | { success: false; error: string };

/**
 * 初回オンボーディングツアーを「完了・スキップした」状態として記録する。
 * 完了・スキップのどちらから呼ばれても同じ扱いにする(以後、自動表示しないため)。
 */
export async function completeOnboarding(storeId: string): Promise<CompleteOnboardingResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const { error } = await supabase
    .from("stores")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", storeId);
  if (error) return { success: false, error: dbErrorMessage("案内の完了状態の保存", error) };
  return { success: true };
}
