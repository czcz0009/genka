/**
 * 過去の期間(月)の食材原価を、当時実際に使われていた仕入単価で計算するための
 * ヘルパー。
 *
 * 背景(不具合): 「今見直すべきメニュー」画面で過去の月を選んでも、その月の原価計算は
 * ingredients.current_purchase_price(=今現在の仕入単価)を使って毎回再計算していた。
 * そのため、値上がり後にその画面を見ると、過去の月の原価率・原価合計まで
 * 今の(高い)単価で遡及的に上書きされてしまい、「先月は原価率が高かった」ように
 * 誤って表示されていた。
 *
 * 対応方針: 食材ごとの仕入単価の変更履歴(ingredient_price_history、全件)を
 * get_ingredient_price_history RPCで取得し、「その月の末日時点で最新だった価格」を
 * JS側で解決してから原価計算に使う(コアの計算式 calcMenuTotalCost 等は変更しない)。
 * 該当する履歴が無い食材(価格変更が一度もない、または履歴機能導入前からある食材)は
 * 現在の仕入単価にフォールバックする。
 */

export interface PriceHistoryEntry {
  ingredientId: string;
  /** 円 */
  price: number;
  /** ISO日時文字列(timestamptz) */
  recordedAt: string;
}

/**
 * 指定した食材の、ある期間の末日(periodEndDate、"YYYY-MM-DD")時点で最新だった仕入単価を解決する。
 *
 * periodEndDateはその日の終わり(23:59:59.999)まで含めて判定する
 * (月末当日に記録された価格変更もその月の実績として扱うため)。
 * 該当する履歴が1件もない場合は currentPrice にフォールバックする。
 */
export function resolveHistoricalPrice(
  history: PriceHistoryEntry[],
  ingredientId: string,
  periodEndDate: string,
  currentPrice: number,
): number {
  const cutoff = `${periodEndDate}T23:59:59.999Z`;
  let latest: PriceHistoryEntry | null = null;
  for (const entry of history) {
    if (entry.ingredientId !== ingredientId) continue;
    if (entry.recordedAt > cutoff) continue;
    if (latest == null || entry.recordedAt > latest.recordedAt) latest = entry;
  }
  return latest ? latest.price : currentPrice;
}
