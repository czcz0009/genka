import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuRanking } from "./menuRanking.ts";
import { withResolvedPrepItemPrices, resolveUnsetLeaves } from "./prepItemCost.ts";
import { buildSalesSummary } from "./salesSummary.ts";

/**
 * 売上管理画面の集計(検算済みのテストケース①〜⑥・⑤')。
 * 方針: 単価未設定の食材を含むメニューは「計算できていません」で、原価率・利益を出さない。
 * 上部の合計は計算できたメニューだけで出し、外したメニューは注記する
 * (ダッシュボードの平均原価率・FL比率と同じ扱い)。
 *
 * 前提(ステップ2の検算セット):
 *   生姜焼き定食 売価1,000円・原価330円・300食
 *   オニオンスライス 売価300円・原価25円・100食
 *   柚子シャーベット 売価400円・柚子が単価未設定・50食
 *   まかない 売価未設定
 */

type Opts = {
  yuzuSold?: number;
  makanaiSold?: number;
  mirinUnset?: boolean;
  yuzuPriceSetToZero?: boolean;
  allUnset?: boolean;
};

function summaries(opts: Opts = {}) {
  const ingredients = [
    { id: "pork", name: "豚肉", currentPurchasePrice: 2, priceIsSet: !opts.allUnset, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
    { id: "onion", name: "たまねぎ", currentPurchasePrice: 0.2, priceIsSet: !opts.allUnset, yieldRatePercent: 80, isPrepItem: false, yieldQuantity: null },
    { id: "soy", name: "醤油", currentPurchasePrice: 0.5, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
    { id: "mirin", name: "みりん", currentPurchasePrice: opts.mirinUnset ? 0 : 0.3, priceIsSet: !opts.mirinUnset, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
    { id: "sauce", name: "タレ", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 200 },
    { id: "yuzu", name: "柚子", currentPurchasePrice: 0, priceIsSet: !!opts.yuzuPriceSetToZero, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  ];
  const components = [
    { prepItemId: "sauce", componentId: "soy", quantity: 100 },
    { prepItemId: "sauce", componentId: "mirin", quantity: 100 },
  ];
  const menus = [
    { id: "ginger", name: "生姜焼き定食", sellingPrice: 1000, targetCostRate: null },
    { id: "onion-slice", name: "オニオンスライス", sellingPrice: 300, targetCostRate: 25 },
    { id: "sorbet", name: "柚子シャーベット", sellingPrice: 400, targetCostRate: null },
    { id: "makanai", name: "まかない", sellingPrice: null, targetCostRate: null },
  ];
  const menuIngredients = [
    { menuId: "ginger", ingredientId: "pork", quantity: 150 },
    { menuId: "ginger", ingredientId: "onion", quantity: 40 },
    { menuId: "ginger", ingredientId: "sauce", quantity: 50 },
    { menuId: "onion-slice", ingredientId: "onion", quantity: 100 },
    { menuId: "sorbet", ingredientId: "yuzu", quantity: 30 },
    { menuId: "makanai", ingredientId: "pork", quantity: 100 },
  ];
  const sales = [
    { menuId: "ginger", quantitySold: 300 },
    { menuId: "onion-slice", quantitySold: 100 },
    { menuId: "sorbet", quantitySold: opts.yuzuSold ?? 50 },
    { menuId: "makanai", quantitySold: opts.makanaiSold ?? 0 },
  ];
  return buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: withResolvedPrepItemPrices(ingredients, components),
    sales,
    defaultTargetCostRate: 30,
    unsetLeavesByIngredientId: resolveUnsetLeaves(ingredients, components),
  });
}

const row = (s: ReturnType<typeof buildSalesSummary>, menuId: string) => s.rows.find((r) => r.menuId === menuId)!;
const approx = (actual: number | null, expected: number) => {
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
};
const rate1 = (n: number | null) => (n == null ? null : Number(n.toFixed(1)));

test("① 検算セット: 生姜焼き利益201,000円・オニオン利益27,500円・柚子は計算できていない。合計は売上330,000円・原価101,500円・利益228,500円・原価率30.8%", () => {
  const s = buildSalesSummary(summaries());
  approx(row(s, "ginger").profit, 201_000);
  assert.equal(rate1(row(s, "ginger").costRate), 33.0);
  approx(row(s, "onion-slice").profit, 27_500);
  assert.equal(rate1(row(s, "onion-slice").costRate), 8.3);
  const sorbet = row(s, "sorbet");
  assert.equal(sorbet.status, "unset");
  assert.equal(sorbet.revenue, 20_000);
  assert.equal(sorbet.costRate, null);
  assert.equal(sorbet.profit, null);
  approx(s.totals.sales, 330_000);
  approx(s.totals.cost, 101_500);
  approx(s.totals.profit, 228_500);
  assert.equal(rate1(s.totals.costRate), 30.8);
  assert.deepEqual(s.unsetExcluded, { menuCount: 1, salesAmount: 20_000 });
  assert.deepEqual(s.noPriceExcluded, { menuCount: 0, quantitySold: 0 });
  assert.equal(s.isPartial, true);
});

test("② 柚子が1食も売れていない: 柚子の行は計算できていない。合計は①と同じで、注記は出さない", () => {
  const s = buildSalesSummary(summaries({ yuzuSold: 0 }));
  assert.equal(row(s, "sorbet").status, "unset");
  approx(s.totals.sales, 330_000);
  approx(s.totals.cost, 101_500);
  approx(s.totals.profit, 228_500);
  assert.equal(rate1(s.totals.costRate), 30.8);
  assert.deepEqual(s.unsetExcluded, { menuCount: 0, salesAmount: 0 });
  assert.equal(s.isPartial, false);
});

test("③ 仕込み品タレの材料みりんが未設定: 生姜焼きも計算できていない。合計は売上30,000円・原価2,500円・利益27,500円・原価率8.3%、未計算2品(売上320,000円)", () => {
  const s = buildSalesSummary(summaries({ mirinUnset: true }));
  assert.equal(row(s, "ginger").status, "unset");
  assert.equal(row(s, "ginger").profit, null);
  approx(s.totals.sales, 30_000);
  approx(s.totals.cost, 2_500);
  approx(s.totals.profit, 27_500);
  assert.equal(rate1(s.totals.costRate), 8.3);
  assert.deepEqual(s.unsetExcluded, { menuCount: 2, salesAmount: 320_000 });
});

test("④ 柚子を0円と明示して設定済み: 計算対象(利益20,000円・原価率0.0%)。合計は売上350,000円・原価101,500円・利益248,500円・原価率29.0%、注記なし", () => {
  const s = buildSalesSummary(summaries({ yuzuPriceSetToZero: true }));
  assert.equal(row(s, "sorbet").status, "computed");
  approx(row(s, "sorbet").profit, 20_000);
  assert.equal(rate1(row(s, "sorbet").costRate), 0.0);
  approx(s.totals.sales, 350_000);
  approx(s.totals.cost, 101_500);
  approx(s.totals.profit, 248_500);
  assert.equal(rate1(s.totals.costRate), 29.0);
  assert.equal(s.isPartial, false);
});

test("⑤ 売価未設定のまかないに販売10食: 行は全部「-」、合計は①と同じ、注記は未計算1品(売上20,000円)と売価未設定1品(販売10食)", () => {
  const s = buildSalesSummary(summaries({ makanaiSold: 10 }));
  const makanai = row(s, "makanai");
  assert.equal(makanai.status, "noPrice");
  assert.equal(makanai.revenue, null);
  assert.equal(makanai.costRate, null);
  assert.equal(makanai.profit, null);
  approx(s.totals.sales, 330_000);
  approx(s.totals.cost, 101_500);
  approx(s.totals.profit, 228_500);
  assert.equal(rate1(s.totals.costRate), 30.8);
  assert.deepEqual(s.unsetExcluded, { menuCount: 1, salesAmount: 20_000 });
  assert.deepEqual(s.noPriceExcluded, { menuCount: 1, quantitySold: 10 });
  assert.equal(s.isPartial, true);
});

test("⑤' まかないの販売が0食: 売価未設定の注記は出さない", () => {
  const s = buildSalesSummary(summaries({ makanaiSold: 0, yuzuSold: 0 }));
  assert.deepEqual(s.noPriceExcluded, { menuCount: 0, quantitySold: 0 });
  assert.equal(s.isPartial, false);
});

test("⑥ 全メニューが未計算: 合計は売上・原価・利益・原価率とも「-」(null)、注記は未計算の品数と売上", () => {
  const s = buildSalesSummary(summaries({ allUnset: true }));
  assert.deepEqual(s.totals, { sales: null, cost: null, profit: null, costRate: null });
  // 生姜焼き300,000円 + オニオン30,000円 + 柚子20,000円
  assert.deepEqual(s.unsetExcluded, { menuCount: 3, salesAmount: 350_000 });
  assert.equal(s.isPartial, true);
});
