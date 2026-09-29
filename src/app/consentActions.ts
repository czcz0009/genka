"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { TERMS_VERSION } from "@/lib/legalVersion.ts";

/**
 * 利用規約・プライバシーポリシーへの同意まわり。
 *
 * - 新規登録直後(LoginForm.tsx、signUp成功後)
 * - 既存ユーザーの再同意(ConsentGate.tsx、(app)/layout.tsxから表示)
 * の両方から、recordTermsConsentを呼ぶ。
 */

export type RecordTermsConsentResult = { success: true } | { success: false; error: string };

export async function recordTermsConsent(): Promise<RecordTermsConsentResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase, userId } = ctx;

  const { error } = await supabase
    .from("user_consents")
    .upsert({ user_id: userId, terms_version: TERMS_VERSION, accepted_at: new Date().toISOString() });
  if (error) {
    return { success: false, error: `同意の記録に失敗しました: ${error.message}` };
  }
  return { success: true };
}

/**
 * 今ログイン中の本人が、現在の規約バージョンに同意済みかどうか。
 * 未ログイン・Supabase未設定の場合はfalse(呼び出し側でリダイレクト等の
 * 別処理に任せる)。
 */
export async function hasCurrentTermsConsent(): Promise<boolean> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return false;
  const { supabase, userId } = ctx;

  const { data } = await supabase
    .from("user_consents")
    .select("terms_version")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.terms_version === TERMS_VERSION;
}
