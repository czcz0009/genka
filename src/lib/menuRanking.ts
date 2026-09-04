/**
 * メニュー別収益貢献度ランキング。
 *
 * 「原価率」だけでなく「販売数量 × (売価-原価)」で実際の利益貢献度を算出する。
 * 原価率が低くても数が出ないメニューより、原価率がやや高くてもよく出るメニューの方が
 * 店の利益への貢献が大きい、というケースを見えるようにするのが狙い。
 */
import { calcMenuTotalCost, calcCostRate, calcSuggestedPriceIncrease, type UnitPriceMap } from "./costCalc.ts";
import type { MenuCostSummary } from "./types.ts";

export interface RankingMenu {
  id: string;
  name: string;
  sellingPrice: number | null;
  /** null なら defaultTargetCostRate を使う */
  targetCostRate: number | null;
}

export interface RankingMenuIngredient {
  menuId: string;
  ingredientId: string;
  quantity: number;
}

export interface RankingIngredient {
  id: string;
  currentPurchasePrice: number;
}

/** 対象期間に集計済みの、メニューごとの販売数量 */
export interface RankingSales {
  menuId: string;
  quantitySold: number;
}

export interface BuildMenuRankingInput {
  menus: RankingMenu[];
  menuIngredients: RankingMenuIngredient[];
  ingredients: RankingIngredient[];
  sales: RankingSales[];
  defaultTargetCostRate: number;
  /** 値上げ目安額の丸め単位(円)。デフォルト10円。 */
  priceRoundTo?: number;
}

/**
 * 利益貢献度(quantitySold × (sellingPrice - totalCost))降順でランキングを組み立てる。
 * 売価未設定などで貢献度が計算できないメニューは末尾に回す。
 */
export function buildMenuRanking(input: BuildMenuRankingInput): MenuCostSummary[] {
  const { menus, menuIngredients, ingredients, sales, defaultTargetCostRate, priceRoundTo = 10 } = input;

  const unitPrices: UnitPriceMap = new Map(ingredients.map((i) => [i.id, i.currentPurchasePrice]));
  const salesByMenuId = new Map(sales.map((s) => [s.menuId, s.quantitySold]));
  const linesByMenuId = new Map<string, RankingMenuIngredient[]>();
  for (const line of menuIngredients) {
    const list = linesByMenuId.get(line.menuId) ?? [];
    list.push(line);
    linesByMenuId.set(line.menuId, list);
  }

  const summaries: MenuCostSummary[] = menus.map((menu) => {
    const lines = linesByMenuId.get(menu.id) ?? [];
    const totalCost = calcMenuTotalCost(lines, unitPrices);
    const costRate = calcCostRate(totalCost, menu.sellingPrice);
    const targetCostRate = menu.targetCostRate ?? defaultTargetCostRate;
    const overTarget = costRate != null && costRate > targetCostRate;
    const quantitySold = salesByMenuId.get(menu.id) ?? 0;
    const profitContribution =
      menu.sellingPrice != null ? quantitySold * (menu.sellingPrice - totalCost) : null;
    const suggestedPriceIncrease = overTarget
      ? calcSuggestedPriceIncrease(totalCost, menu.sellingPrice, targetCostRate, priceRoundTo)
      : 0;

    return {
      menuId: menu.id,
      menuName: menu.name,
      sellingPrice: menu.sellingPrice,
      totalCost,
      costRate,
      targetCostRate,
      overTarget,
      quantitySold,
      profitContribution,
      suggestedPriceIncrease,
    };
  });

  summaries.sort((a, b) => {
    if (a.profitContribution == null && b.profitContribution == null) return 0;
    if (a.profitContribution == null) return 1;
    if (b.profitContribution == null) return -1;
    return b.profitContribution - a.profitContribution;
  });

  return summaries;
}
