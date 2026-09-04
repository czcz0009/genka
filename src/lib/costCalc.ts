/**
 * メニューの原価・原価率計算。②(仕入れ値変動アラート)・③(利益貢献度ランキング)の
 * どちらからも使う共通ロジック。
 *
 * 前提: menu_ingredients.quantity の単位は、対応する ingredients.unit と一致している
 * ("300g" のレシピ行に対して仕入単価が「kgあたり」のように単位が食い違うケースは、
 * ①の取り込み時点で同一食材の単位食い違いとして警告済みのため、ここでは考慮しない)。
 */
export interface CostCalcMenuIngredient {
  ingredientId: string;
  quantity: number;
}

/** ingredientId -> 現在の仕入単価(単位あたり) */
export type UnitPriceMap = Map<string, number>;

/** メニュー1品分の合計原価。単価が見つからない食材は0円として計算から除外する。 */
export function calcMenuTotalCost(
  menuIngredients: CostCalcMenuIngredient[],
  unitPrices: UnitPriceMap,
): number {
  return menuIngredients.reduce((sum, line) => {
    const price = unitPrices.get(line.ingredientId);
    if (price == null) return sum;
    return sum + price * line.quantity;
  }, 0);
}

/** 原価率(%)。売価が未設定(null)または0以下なら計算不能としてnullを返す。 */
export function calcCostRate(totalCost: number, sellingPrice: number | null): number | null {
  if (sellingPrice == null || sellingPrice <= 0) return null;
  return (totalCost / sellingPrice) * 100;
}

/**
 * 目標原価率まで下げるのに必要な値上げ額の目安(円)。
 * 「理想の原価率30%に対し実際37%、適正価格に戻すには+150円が目安」のような表示に使う。
 *
 * 必要売価 = 原価 ÷ (目標原価率 / 100) を計算し、現在売価との差額を roundTo 単位で
 * 切り上げる(切り捨てると値上げ後もわずかに目標未達になり得るため、必ず切り上げる)。
 * すでに目標原価率以下なら 0 を返す(値上げ不要)。
 */
export function calcSuggestedPriceIncrease(
  totalCost: number,
  currentSellingPrice: number | null,
  targetCostRatePercent: number,
  roundTo = 10,
): number | null {
  if (currentSellingPrice == null || currentSellingPrice <= 0) return null;
  if (targetCostRatePercent <= 0) return null;

  const requiredPrice = totalCost / (targetCostRatePercent / 100);
  const rawIncrease = requiredPrice - currentSellingPrice;
  if (rawIncrease <= 0) return 0;
  return Math.ceil(rawIncrease / roundTo) * roundTo;
}
