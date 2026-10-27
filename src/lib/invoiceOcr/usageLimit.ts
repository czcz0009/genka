/**
 * 納品書の読み取り(AI)の回数の上限。
 *
 * 2026-10-27 にモニター期間向けに見直した(Mahiro確認済み):
 * - 1アカウント: 月の成功50回・月の試行100回(日本時間の毎月1日にリセット)
 * - アプリ全体: 1日の試行200回(日本時間の0時にリセット。悪用されても費用が1日数百円で止まる)
 * 数え方はDBの関数(マイグレーション0029の begin_ocr_attempt_v2 等)。値はこのファイルからDBの関数に渡す。
 * テストは usageLimit.test.ts。
 */

export const OCR_MONTHLY_USE_LIMIT = 50;
export const OCR_MONTHLY_ATTEMPT_LIMIT = 100;
export const OCR_GLOBAL_DAILY_ATTEMPT_LIMIT = 200;

/** 旧: β期間の累計の上限(累計3回・試行10回)。新しい関数に切り替えるまで、今の本番の画面が使う。切り替え後に消す */
export const OCR_USAGE_LIMIT = 3;
/** 旧: 累計の試行の上限(切り替え後に消す) */
export const OCR_ATTEMPT_LIMIT = 10;

/** 残り回数(0未満にはならない) */
export function remainingOcrUses(usedCount: number, limit: number = OCR_USAGE_LIMIT): number {
  return Math.max(0, limit - usedCount);
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 日本時間の「2026-10」 */
export function jstMonthKey(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 7);
}
/** 日本時間の「2026-10-27」 */
export function jstDayKey(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export type OcrGateResult = "use_limit" | "attempt_limit" | "global_limit" | "unavailable";

/** 読み取りを断ったときの日本語の案内 */
export function ocrGateMessage(reason: OcrGateResult): string {
  switch (reason) {
    case "use_limit":
      return `今月の読み取りの回数の上限(${OCR_MONTHLY_USE_LIMIT}回)に達しました。来月1日に、回数が元に戻ります。`;
    case "attempt_limit":
      return "今月の読み取りの試行回数の上限に達しました。来月1日に、回数が元に戻ります。";
    case "global_limit":
      return "本日の読み取りの受付が上限に達しました。明日もう一度お試しください。";
    case "unavailable":
      return "ただいま読み取りを使えません。時間をおいて、もう一度お試しください。";
  }
}
