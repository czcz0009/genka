import type { MenuCostSummary } from "./types.ts";

/**
 * 売上管理画面の集計(メニューごとの行と、上部の合計)。
 *
 * 方針(2026-10-06決定): 単価未設定の食材(仕込み品の材料も含む)を使うメニューは
 * 「計算できていません」とし、原価率・利益を出さない(売上は単価に関係なく分かるので出す)。
 * 上部の合計は計算できたメニューだけで出し、外したメニューは注記する
 * (ダッシュボードの平均原価率・FL比率と同じ扱い)。売価未設定のメニューは売上が
 * 分からないため、合計に含めず、販売数だけを注記する。
 *
 * 以前は単価未設定の食材を0円として計算した原価率・利益を、そのまま表示・合計していた。
 */

export type SalesRowStatus = "computed" | "unset" | "noPrice";

export interface SalesRow {
  menuId: string;
  menuName: string;
  quantitySold: number;
  sellingPrice: number | null;
  /** computed: 計算できた / unset: 単価未設定の食材を含む / noPrice: 売価未設定 */
  status: SalesRowStatus;
  /** 実売上高(売価×販売数量)。売価未設定ならnull。 */
  revenue: number | null;
  /** 原価率(%)。computed以外はnull。 */
  costRate: number | null;
  /** 利益(売上-原価×販売数量)。computed以外はnull。 */
  profit: number | null;
  overTarget: boolean;
  unsetIngredients: { name: string; viaPrepItemName: string | null }[];
}

export interface SalesTotals {
  /** 計算できたメニューだけの合計。計算できたメニューが1つも無ければnull(「-」表示)。 */
  sales: number | null;
  cost: number | null;
  profit: number | null;
  /** 売上が0円の時もnull。 */
  costRate: number | null;
}

export interface SalesSummary {
  rows: SalesRow[];
  totals: SalesTotals;
  /** 合計から外した、単価未設定の食材を含むメニュー(販売実績があるものだけを数える)。 */
  unsetExcluded: { menuCount: number; salesAmount: number };
  /** 合計から外した、売価未設定のメニュー(販売実績があるものだけを数える)。 */
  noPriceExcluded: { menuCount: number; quantitySold: number };
  /** 合計から外したメニューがあるか(trueなら見出しを「計算できたメニューの合計」にする)。 */
  isPartial: boolean;
}

export function buildSalesSummary(summaries: MenuCostSummary[]): SalesSummary {
  const rows: SalesRow[] = summaries.map((s) => {
    // 売価未設定を優先する(売上が分からないため、未計算の売上額に足せない)。
    const status: SalesRowStatus = s.sellingPrice == null ? "noPrice" : s.hasUnsetIngredient ? "unset" : "computed";
    const revenue = s.sellingPrice != null ? s.sellingPrice * s.quantitySold : null;
    return {
      menuId: s.menuId,
      menuName: s.menuName,
      quantitySold: s.quantitySold,
      sellingPrice: s.sellingPrice,
      status,
      revenue,
      costRate: status === "computed" ? s.costRate : null,
      profit: status === "computed" && revenue != null ? revenue - s.totalCost * s.quantitySold : null,
      overTarget: status === "computed" && s.overTarget,
      unsetIngredients: s.unsetIngredients,
    };
  });

  const computed = summaries.filter((s) => s.sellingPrice != null && !s.hasUnsetIngredient);
  let totals: SalesTotals = { sales: null, cost: null, profit: null, costRate: null };
  if (computed.length > 0) {
    const sales = computed.reduce((sum, s) => sum + s.sellingPrice! * s.quantitySold, 0);
    const cost = computed.reduce((sum, s) => sum + s.totalCost * s.quantitySold, 0);
    totals = { sales, cost, profit: sales - cost, costRate: sales > 0 ? (cost / sales) * 100 : null };
  }

  const unsetSold = rows.filter((r) => r.status === "unset" && r.quantitySold > 0);
  const noPriceSold = rows.filter((r) => r.status === "noPrice" && r.quantitySold > 0);
  const unsetExcluded = { menuCount: unsetSold.length, salesAmount: unsetSold.reduce((sum, r) => sum + (r.revenue ?? 0), 0) };
  const noPriceExcluded = { menuCount: noPriceSold.length, quantitySold: noPriceSold.reduce((sum, r) => sum + r.quantitySold, 0) };

  return {
    rows,
    totals,
    unsetExcluded,
    noPriceExcluded,
    isPartial: unsetExcluded.menuCount > 0 || noPriceExcluded.menuCount > 0,
  };
}
