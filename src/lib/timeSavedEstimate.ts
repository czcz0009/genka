/**
 * Excelで同じ作業をしていた場合と比べた、時間節約の大まかな目安。
 * 厳密な計測ではなく、保守的な仮定に基づく概算(ダッシュボードの控えめな
 * 補足表示専用)。過大な数字にならないよう、あえて小さめの節約分数を使う。
 *
 * 仮定:
 * - CSV取り込みで1行取り込むごとに、Excelで手入力+単価計算するより
 *   TIME_SAVED_PER_CSV_ROW_MINUTES分節約できるとみなす
 * - メニューを1件登録するごとに、Excelで原価率を都度計算し直すより
 *   TIME_SAVED_PER_MENU_MINUTES分節約できるとみなす
 */
export const TIME_SAVED_PER_CSV_ROW_MINUTES = 3;
export const TIME_SAVED_PER_MENU_MINUTES = 2;

/** これ未満ならダッシュボードに表示しない(ほぼ0分の月に無理に見せて信頼性を損なわないため)。 */
export const TIME_SAVED_DISPLAY_THRESHOLD_MINUTES = 30;

export interface TimeSavedInput {
  /** 今月取り込んだCSVの合計行数 */
  csvRowsThisMonth: number;
  /** 今月登録されたメニュー数 */
  menusRegisteredThisMonth: number;
}

export function estimateTimeSavedMinutes(input: TimeSavedInput): number {
  return (
    input.csvRowsThisMonth * TIME_SAVED_PER_CSV_ROW_MINUTES +
    input.menusRegisteredThisMonth * TIME_SAVED_PER_MENU_MINUTES
  );
}

/** 「約3時間」「約45分」のような大まかな表示用の文字列。1時間未満は分単位、以上は時間単位(小数第1位)。 */
export function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `約${Math.round(minutes)}分`;
  const hours = minutes / 60;
  return `約${hours.toFixed(hours < 10 ? 1 : 0)}時間`;
}
