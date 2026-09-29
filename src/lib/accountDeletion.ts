/**
 * 退会(アカウント削除)の猶予期間まわりの純粋ロジック。
 *
 * 方針: 即時削除ではなく、申請から30日間の猶予期間を置く
 * (account_deletion_requests、0023マイグレーション)。実際の削除は
 * cronジョブ(api/cron/delete-scheduled-accounts)が毎日1回処理する。
 */

/** 猶予期間(日数)。 */
export const GRACE_PERIOD_DAYS = 30;

/** 誤操作防止のため、退会画面で入力させる確認文字列(完全一致のみ許可)。 */
export const DELETE_CONFIRMATION_TEXT = "退会する";

/** 申請日時から、実行予定日時(scheduled_for)を計算する。 */
export function calcScheduledFor(requestedAt: Date, graceDays: number = GRACE_PERIOD_DAYS): Date {
  return new Date(requestedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
}

/**
 * 実行予定日時までの残り日数(切り上げ)。
 * 例: 残り0.1日でも「1日後」と表示する(まだ削除されていないため0日後とは言わない)。
 * 期限を過ぎている場合は0を返す(マイナス表記を避ける。cronがまだ処理していないだけ)。
 */
export function daysRemaining(scheduledFor: Date, now: Date = new Date()): number {
  const diffMs = scheduledFor.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
