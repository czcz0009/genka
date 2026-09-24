/**
 * 過去の値付け判断(売価変更)の成果追跡。
 *
 * 直近の売価変更について、変更前の直近数ヶ月(販売数量の記録がある月)を
 * 基準にし、変更後の各月の実際の利益と比較して、累計の利益改善額を算出する。
 *
 * この指標は「同じ客数でも単価が変わったことでどれだけ利益が変わったか」を
 * 見るものであり、値上げが客数自体に与えた影響までは分離できない
 * (実際の販売数量をそのまま使うため、客数が落ちていれば改善額も自動的に
 * 小さく/マイナスになるが、それが値上げの影響か他の要因かは区別しない)。
 */

/** 「基準」とする、値上げ直前の月数の上限。記録がこれより少なければある分だけで平均する。 */
export const BASELINE_WINDOW_MONTHS = 3;

export interface MonthlyProfitPoint {
  /** "YYYY-MM" */
  month: string;
  quantitySold: number;
  /** その月の1食あたり利益(売価-原価) */
  profitPerUnit: number;
}

export interface PriceChangeImpactResult {
  oldPrice: number;
  newPrice: number;
  /** 基準の1食あたり利益(変更前の直近数ヶ月を、販売数量で加重平均したもの) */
  baselineProfitPerUnit: number;
  /** 基準の計算に使った月数(実際に記録があった月数、最大BASELINE_WINDOW_MONTHS) */
  baselineMonthCount: number;
  /** 変更後の各月の改善額の合計 */
  cumulativeImprovement: number;
  monthlyBreakdown: { month: string; quantitySold: number; improvement: number }[];
}

/**
 * 売価変更の前後の月次データから、累計の利益改善額を計算する。
 *
 * beforeMonths: 変更前の月(どの順序でもよい)。直近(月が新しい方)から
 * 最大BASELINE_WINDOW_MONTHS件だけを基準の計算に使う。
 * afterMonths: 変更後、新しい売価が適用されている月。
 *
 * 変更前の販売記録が1件も無い場合(基準を計算できない)はnullを返す
 * (呼び出し側で「記録がまだありません」等の案内を出す)。
 */
export function calcPriceChangeImpact(
  oldPrice: number,
  newPrice: number,
  beforeMonths: MonthlyProfitPoint[],
  afterMonths: MonthlyProfitPoint[],
): PriceChangeImpactResult | null {
  const recentBefore = [...beforeMonths].sort((a, b) => b.month.localeCompare(a.month)).slice(0, BASELINE_WINDOW_MONTHS);
  if (recentBefore.length === 0) return null;

  const totalQty = recentBefore.reduce((sum, m) => sum + m.quantitySold, 0);
  if (totalQty <= 0) return null;

  const totalProfit = recentBefore.reduce((sum, m) => sum + m.quantitySold * m.profitPerUnit, 0);
  const baselineProfitPerUnit = totalProfit / totalQty;

  const monthlyBreakdown = afterMonths.map((m) => ({
    month: m.month,
    quantitySold: m.quantitySold,
    improvement: m.quantitySold * (m.profitPerUnit - baselineProfitPerUnit),
  }));
  const cumulativeImprovement = monthlyBreakdown.reduce((sum, m) => sum + m.improvement, 0);

  return {
    oldPrice,
    newPrice,
    baselineProfitPerUnit,
    baselineMonthCount: recentBefore.length,
    cumulativeImprovement,
    monthlyBreakdown,
  };
}
