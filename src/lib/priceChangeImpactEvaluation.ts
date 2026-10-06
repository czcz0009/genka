import { calcEffectiveUnitPrice, calcMenuTotalCost, type UnitPriceMap } from "./costCalc.ts";
import { resolveHistoricalPrice, resolveHistoricalPriceIsSet, type PriceHistoryEntry } from "./ingredientPriceHistory.ts";
import { withResolvedPrepItemPrices, resolveUnsetLeaves, type CostIngredient, type PrepItemComponentLine, type UnsetLeaf } from "./prepItemCost.ts";
import { calcPriceChangeImpact, BASELINE_WINDOW_MONTHS, type MonthlyProfitPoint, type PriceChangeImpactResult } from "./priceChangeImpact.ts";
import { formatMonthLabel } from "./period/month.ts";

/**
 * メニュー詳細「値上げの効果追跡」の入力の組み立てと判定。
 *
 * 以前はメニュー詳細ページの中で、単価未設定の食材を0円として各月の原価を計算し、
 * そのまま改善額を表示していた(「未対応」と明記されたまま残っていた)。
 *
 * ルール(2026-10-06決定): 計算に使う月(変更前の直近BASELINE_WINDOW_MONTHSか月+変更後の
 * すべての月)のどれか1か月でも、その月末の時点で単価未設定の食材(仕込み品の材料も含む)を
 * 含んでいたら、全体を「計算できていません」にする。一部の月だけ外して計算すると、
 * 基準が知らないうちに変わってしまうため。後から単価を設定しても、その月は未設定のまま
 * なので止まり続ける(画面には、どの月の時点で未設定だったかを出す)。
 *
 * 月末時点の単価・未設定かどうかは価格履歴から再現する(resolveHistoricalPrice等)。
 * その月までに履歴が無い食材は今の単価にフォールバックし、未設定とは判定しない。
 */

export interface MenuPriceHistoryRow {
  price: number;
  /** ISO日時文字列 */
  recordedAt: string;
}

export interface MenuSalesRow {
  /** "YYYY-MM-DD" */
  periodStart: string;
  periodEnd: string;
  quantitySold: number;
}

export type MenuPriceChangeImpactOutcome =
  | { status: "ok"; oldPrice: number; newPrice: number; result: PriceChangeImpactResult }
  /** 変更前の販売実績が無く、まだ比較できない */
  | { status: "noBaseline"; oldPrice: number; newPrice: number }
  /** 計算に使う月のどこかで単価未設定の食材を含んでいた。monthは最初にそうなっていた月。 */
  | { status: "unset"; oldPrice: number; newPrice: number; month: string; unsetIngredients: UnsetLeaf[] };

/** ある日(月末)時点の、メニュー1食分の原価と、その時点で単価未設定だった食材。 */
export function menuCostAtDate(input: {
  menuIngredientLines: { ingredientId: string; quantity: number }[];
  ingredients: CostIngredient[];
  prepItemComponents: PrepItemComponentLine[];
  ingredientPriceHistory: PriceHistoryEntry[];
  /** "YYYY-MM-DD" */
  date: string;
}): { cost: number; unsetIngredients: UnsetLeaf[] } {
  const historicized = input.ingredients.map((i) => ({
    ...i,
    yieldQuantity: i.yieldQuantity ?? null,
    currentPurchasePrice: i.isPrepItem ? 0 : resolveHistoricalPrice(input.ingredientPriceHistory, i.id, input.date, i.currentPurchasePrice),
    priceIsSet: i.isPrepItem ? false : resolveHistoricalPriceIsSet(input.ingredientPriceHistory, i.id, input.date),
  }));
  const resolved = withResolvedPrepItemPrices(historicized, input.prepItemComponents);
  const unitPrices: UnitPriceMap = new Map(
    resolved.map((i) => [i.id, { price: calcEffectiveUnitPrice(i.currentPurchasePrice, i.yieldRatePercent), isSet: i.priceIsSet }]),
  );
  const { totalCost, unsetIngredientIds } = calcMenuTotalCost(input.menuIngredientLines, unitPrices);

  const leavesById = resolveUnsetLeaves(historicized, input.prepItemComponents);
  const seen = new Set<string>();
  const unsetIngredients: UnsetLeaf[] = [];
  for (const id of unsetIngredientIds) {
    for (const leaf of leavesById.get(id) ?? []) {
      const key = `${leaf.name}\u0000${leaf.viaPrepItemName ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unsetIngredients.push(leaf);
    }
  }
  return { cost: totalCost, unsetIngredients };
}

/**
 * 直近の売価変更について、値上げの効果追跡の結果を判定する。
 * 売価の変更が1回も無い(履歴が1件以下)場合はnull(何も表示しない)。
 */
export function evaluateMenuPriceChangeImpact(input: {
  /** 古い順 */
  menuPriceHistory: MenuPriceHistoryRow[];
  menuSales: MenuSalesRow[];
  menuIngredientLines: { ingredientId: string; quantity: number }[];
  ingredients: CostIngredient[];
  prepItemComponents: PrepItemComponentLine[];
  ingredientPriceHistory: PriceHistoryEntry[];
}): MenuPriceChangeImpactOutcome | null {
  const history = input.menuPriceHistory;
  if (history.length < 2) return null;

  const newPrice = history[history.length - 1].price;
  const oldPrice = history[history.length - 2].price;
  const changeMonth = history[history.length - 1].recordedAt.slice(0, 7);
  // それより前の変更(あれば)の月。基準期間がさらに古い価格まで遡らないよう、この月以前は除外する。
  const secondToLastChangeMonth = history.length >= 3 ? history[history.length - 3].recordedAt.slice(0, 7) : null;

  const monthly = input.menuSales.map((s) => {
    const month = s.periodStart.slice(0, 7);
    const { cost, unsetIngredients } = menuCostAtDate({ ...input, date: s.periodEnd });
    const price = month < changeMonth ? oldPrice : newPrice;
    return { month, quantitySold: s.quantitySold, profitPerUnit: price - cost, unsetIngredients };
  });

  const beforeMonths = monthly.filter(
    (p) => p.month < changeMonth && (secondToLastChangeMonth == null || p.month > secondToLastChangeMonth),
  );
  const afterMonths = monthly.filter((p) => p.month >= changeMonth).sort((a, b) => a.month.localeCompare(b.month));
  // calcPriceChangeImpactが基準に使うのと同じ「変更前の直近の月」
  const baselineMonths = [...beforeMonths].sort((a, b) => b.month.localeCompare(a.month)).slice(0, BASELINE_WINDOW_MONTHS);
  if (baselineMonths.length === 0) return { status: "noBaseline", oldPrice, newPrice };

  const usedMonths = [...baselineMonths, ...afterMonths].sort((a, b) => a.month.localeCompare(b.month));
  const firstUnset = usedMonths.find((m) => m.unsetIngredients.length > 0);
  if (firstUnset) {
    return { status: "unset", oldPrice, newPrice, month: firstUnset.month, unsetIngredients: firstUnset.unsetIngredients };
  }

  const toPoint = (m: (typeof monthly)[number]): MonthlyProfitPoint => ({
    month: m.month,
    quantitySold: m.quantitySold,
    profitPerUnit: m.profitPerUnit,
  });
  const result = calcPriceChangeImpact(oldPrice, newPrice, beforeMonths.map(toPoint), afterMonths.map(toPoint));
  if (!result) return { status: "noBaseline", oldPrice, newPrice };
  return { status: "ok", oldPrice, newPrice, result };
}

/** 「計算できていません(未設定: 豚肉。2026年7月時点で未設定だったため)」 */
export function formatPriceChangeUnsetReason(outcome: { month: string; unsetIngredients: UnsetLeaf[] }): string {
  const names = outcome.unsetIngredients
    .map((u) => (u.viaPrepItemName ? `${u.name}(${u.viaPrepItemName}の材料)` : u.name))
    .join("、");
  return `計算できていません(未設定: ${names}。${formatMonthLabel(outcome.month)}時点で未設定だったため)`;
}
