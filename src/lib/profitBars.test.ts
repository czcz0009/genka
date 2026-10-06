import { test } from "node:test";
import assert from "node:assert/strict";
import { maxProfitForBars } from "./menuRanking.ts";
import type { MenuCostSummary } from "./types.ts";

/**
 * 今見直すべきメニューの「利益貢献度」の棒グラフ(検算済みのテストケースB1)。
 * 棒の長さの基準(最大値)から、単価未設定の食材を含むメニュー(0円扱いの誤った利益)を外す。
 */
const summary = (menuId: string, profitContribution: number | null, hasUnsetIngredient: boolean): MenuCostSummary => ({
  menuId,
  menuName: menuId,
  sellingPrice: 1000,
  totalCost: 0,
  costRate: null,
  targetCostRate: 30,
  overTarget: false,
  quantitySold: 10,
  profitContribution,
  suggestedPriceIncrease: 0,
  monthlyProfitImpact: null,
  hasUnsetIngredient,
  unsetIngredients: [],
});

test("B1: A(計算済み・利益50,000円)とB(未計算・誤った利益116,000円)なら、最大値は50,000円(Aの棒が100%)", () => {
  const max = maxProfitForBars([summary("A", 50_000, false), summary("B", 116_000, true)]);
  assert.equal(max, 50_000);
  assert.equal((50_000 / max) * 100, 100);
});

test("計算済みのメニューが無い・利益がすべて0以下でも、0で割らないよう最大値は1以上", () => {
  assert.equal(maxProfitForBars([summary("B", 116_000, true)]), 1);
  assert.equal(maxProfitForBars([summary("A", -5_000, false), summary("C", null, false)]), 1);
});
