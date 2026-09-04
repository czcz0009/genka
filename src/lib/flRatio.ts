/**
 * FL比率(食材原価+人件費)・FLR比率(+家賃)の算出。
 *
 * 業界目安(FL比率60%未満・FLR比率70%未満)は業態により大きく変わるため、
 * あくまで一般的な目安として扱い、原因の解釈や改善提案はしない
 * (機械的な段階表示に留める、という要件どおり)。
 */
import type { MenuCostSummary } from "./types.ts";

export type FixedCostType = "rent" | "labor";

export interface FixedCostRow {
  costType: FixedCostType;
  amount: number;
  /** ISO日付文字列(YYYY-MM-DD) */
  periodStart: string;
  /** null = 継続中(主に家賃) */
  periodEnd: string | null;
}

export interface Period {
  start: string;
  end: string;
}

/**
 * 指定期間に適用する固定費行を1件選ぶ。対象期間と重なる行のうち、
 * 最も period_start が新しいもの(＝直近に登録・改定された値)を採用する。
 * 該当なしなら null。
 */
export function selectApplicableFixedCost(
  costs: FixedCostRow[],
  costType: FixedCostType,
  period: Period,
): number | null {
  const candidates = costs.filter(
    (c) =>
      c.costType === costType &&
      c.periodStart <= period.end &&
      (c.periodEnd == null || c.periodEnd >= period.start),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
  return candidates[0].amount;
}

/** 対象期間のランキング結果から、総売上・総食材原価を集計する(売価未設定のメニューは除く) */
export function aggregateSalesAndFoodCost(summaries: MenuCostSummary[]): {
  totalSales: number;
  totalFoodCost: number;
} {
  return summaries.reduce(
    (acc, s) => {
      if (s.sellingPrice == null) return acc;
      acc.totalSales += s.sellingPrice * s.quantitySold;
      acc.totalFoodCost += s.totalCost * s.quantitySold;
      return acc;
    },
    { totalSales: 0, totalFoodCost: 0 },
  );
}

export const FL_BENCHMARK_PERCENT = 60;
export const FLR_BENCHMARK_PERCENT = 70;
/**
 * 目安を超えてから「注意」→「危険」に切り替える猶予幅(ポイント)。
 * 統計的根拠のある値ではなく、目安ちょうどでいきなり「危険」表示にならないよう
 * 設けた説明可能なデフォルト値(将来調整可能)。
 */
const CAUTION_MARGIN_POINTS = 10;

export type Severity = "normal" | "caution" | "danger";

function classifySeverity(ratio: number | null, benchmark: number): Severity | null {
  if (ratio == null) return null;
  if (ratio <= benchmark) return "normal";
  if (ratio <= benchmark + CAUTION_MARGIN_POINTS) return "caution";
  return "danger";
}

export interface FlRatioInput {
  totalSales: number;
  totalFoodCost: number;
  /** その期間の人件費。未登録ならnull。 */
  laborCost: number | null;
  /** その期間に適用される家賃。未登録ならnull(FLRは計算しない)。 */
  rentCost: number | null;
}

export interface FlRatioResult {
  foodCostRate: number | null;
  laborCostRate: number | null;
  flRate: number | null;
  flrRate: number | null;
  flSeverity: Severity | null;
  flrSeverity: Severity | null;
}

export function calcFlRatios(input: FlRatioInput): FlRatioResult {
  const { totalSales, totalFoodCost, laborCost, rentCost } = input;
  if (totalSales <= 0) {
    return {
      foodCostRate: null,
      laborCostRate: null,
      flRate: null,
      flrRate: null,
      flSeverity: null,
      flrSeverity: null,
    };
  }

  const foodCostRate = (totalFoodCost / totalSales) * 100;
  const laborCostRate = laborCost != null ? (laborCost / totalSales) * 100 : null;
  const flRate = laborCost != null ? ((totalFoodCost + laborCost) / totalSales) * 100 : null;
  const flrRate =
    laborCost != null && rentCost != null ? ((totalFoodCost + laborCost + rentCost) / totalSales) * 100 : null;

  return {
    foodCostRate,
    laborCostRate,
    flRate,
    flrRate,
    flSeverity: classifySeverity(flRate, FL_BENCHMARK_PERCENT),
    flrSeverity: classifySeverity(flrRate, FLR_BENCHMARK_PERCENT),
  };
}
