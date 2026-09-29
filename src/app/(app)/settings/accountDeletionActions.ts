"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { GRACE_PERIOD_DAYS, DELETE_CONFIRMATION_TEXT, calcScheduledFor } from "@/lib/accountDeletion.ts";

/**
 * 退会(アカウント削除)の申請・取り消し。
 *
 * ここでは実際の削除は行わない(account_deletion_requestsに1行作る・消すだけ)。
 * 実際のauth.users削除は、猶予期間(30日)が過ぎた申請をcronジョブ
 * (api/cron/delete-scheduled-accounts)がservice role権限で処理する。
 * この作りにより、通常のServer Actionはservice roleを一切使わずに済む
 * (誰の行を操作するかは、常にrequireAuthedClientで取得した本人のuserIdのみ。
 * クライアントから送られてきたIDは信用しない)。
 */

export type RequestAccountDeletionResult =
  | { success: true; scheduledFor: string }
  | { success: false; error: string };

/**
 * 退会を申請する。confirmationText(「退会する」の入力)が一致しない場合は
 * サーバー側でも拒否する(画面のボタン無効化だけに頼らない、誤操作防止の二重チェック)。
 */
export async function requestAccountDeletion(confirmationText: string): Promise<RequestAccountDeletionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase, userId } = ctx;

  if (confirmationText.trim() !== DELETE_CONFIRMATION_TEXT) {
    return { success: false, error: `確認のため「${DELETE_CONFIRMATION_TEXT}」と入力してください` };
  }

  const requestedAt = new Date();
  const scheduledFor = calcScheduledFor(requestedAt, GRACE_PERIOD_DAYS);

  const { error } = await supabase.from("account_deletion_requests").upsert({
    user_id: userId,
    requested_at: requestedAt.toISOString(),
    scheduled_for: scheduledFor.toISOString(),
  });
  if (error) {
    return { success: false, error: `退会の申請に失敗しました: ${error.message}` };
  }

  return { success: true, scheduledFor: scheduledFor.toISOString() };
}

export interface PendingAccountDeletion {
  requestedAt: string;
  scheduledFor: string;
}

/**
 * 今ログイン中の本人に、有効な退会申請があるかを取得する。
 * 全画面共通のバナー表示(layout.tsx)と、設定画面の両方から使う。
 */
export async function getPendingAccountDeletion(): Promise<PendingAccountDeletion | null> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return null;
  const { supabase, userId } = ctx;

  const { data } = await supabase
    .from("account_deletion_requests")
    .select("requested_at, scheduled_for")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { requestedAt: data.requested_at, scheduledFor: data.scheduled_for };
}

export type CancelAccountDeletionResult = { success: true } | { success: false; error: string };

/** 退会の申請を取り消す(猶予期間中はいつでも可能)。 */
export async function cancelAccountDeletion(): Promise<CancelAccountDeletionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase, userId } = ctx;

  const { error } = await supabase.from("account_deletion_requests").delete().eq("user_id", userId);
  if (error) {
    return { success: false, error: `取り消しに失敗しました: ${error.message}` };
  }
  return { success: true };
}
