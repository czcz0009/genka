import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMenuPriceChangeImpact, formatPriceChangeUnsetReason } from "./priceChangeImpactEvaluation.ts";
import type { PriceHistoryEntry } from "./ingredientPriceHistory.ts";

/**
 * メニュー詳細「値上げの効果追跡」(検算済みのテストケースP1〜P5)。
 *
 * ルール: 計算に使う月(変更前の直近3か月+変更後のすべての月)のどれか1か月でも、
 * その月末の時点で単価未設定の食材を含んでいたら、全体を「計算できていません」にする
 * (改善額・月ごとの内訳・基準の1食あたり利益を出さない)。
 * 月末時点の単価・未設定かどうかは価格履歴から再現し、その月までに履歴が無い食材は
 * 今の単価にフォールバックして、未設定とは判定しない。
 *
 * 前提: 売価を2026年9月に1,000円→1,100円に変更。レシピは豚肉150g(2円/g → 原価300円)。
 * 販売は6〜8月が各100食、9月120食、10月110食。
 */

const sales = (extra: { month: string; qty: number }[] = []) =>
  [
    ...extra,
    { month: "2026-06", qty: 100 },
    { month: "2026-07", qty: 100 },
    { month: "2026-08", qty: 100 },
    { month: "2026-09", qty: 120 },
    { month: "2026-10", qty: 110 },
  ].map((s) => {
    const [y, m] = s.month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { periodStart: `${s.month}-01`, periodEnd: `${s.month}-${String(last).padStart(2, "0")}`, quantitySold: s.qty };
  });

const priceHistory = [
  { price: 1000, recordedAt: "2026-03-01T00:00:00Z" },
  { price: 1100, recordedAt: "2026-09-01T00:00:00Z" },
];

const pork = { id: "pork", name: "豚肉", currentPurchasePrice: 2, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null };
const h = (ingredientId: string, price: number, priceIsSet: boolean, recordedAt: string): PriceHistoryEntry => ({
  ingredientId,
  price,
  priceIsSet,
  recordedAt,
});

test("P1 すべて設定済み: 基準700円、9月+12,000円、10月+11,000円、累計+23,000円", () => {
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: priceHistory,
    menuSales: sales(),
    menuIngredientLines: [{ ingredientId: "pork", quantity: 150 }],
    ingredients: [pork],
    prepItemComponents: [],
    ingredientPriceHistory: [h("pork", 2, true, "2026-01-01T00:00:00Z")],
  });
  assert.equal(out?.status, "ok");
  if (out?.status !== "ok") return;
  assert.equal(out.result.baselineProfitPerUnit, 700);
  assert.deepEqual(
    out.result.monthlyBreakdown.map((m) => [m.month, m.improvement]),
    [
      ["2026-09", 12_000],
      ["2026-10", 11_000],
    ],
  );
  assert.equal(out.result.cumulativeImprovement, 23_000);
});

test("P2 レシピに今も過去も単価未設定の米を含む: 計算できていません(未設定: 米)", () => {
  const rice = { id: "rice", name: "米", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null };
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: priceHistory,
    menuSales: sales(),
    menuIngredientLines: [
      { ingredientId: "pork", quantity: 150 },
      { ingredientId: "rice", quantity: 200 },
    ],
    ingredients: [pork, rice],
    prepItemComponents: [],
    ingredientPriceHistory: [h("pork", 2, true, "2026-01-01T00:00:00Z"), h("rice", 0, false, "2026-01-01T00:00:00Z")],
  });
  assert.equal(out?.status, "unset");
  if (out?.status !== "unset") return;
  assert.deepEqual(out.unsetIngredients, [{ name: "米", viaPrepItemName: null }]);
  assert.equal(out.month, "2026-06"); // 計算に使う最初の月(6月)の時点で未設定
});

test("P3 豚肉が7/1から未設定、8/20に設定: 6月末は履歴が無いので今の単価(設定済み)、7月末時点で未設定のため止まる", () => {
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: priceHistory,
    menuSales: sales(),
    menuIngredientLines: [{ ingredientId: "pork", quantity: 150 }],
    ingredients: [pork],
    prepItemComponents: [],
    ingredientPriceHistory: [h("pork", 0, false, "2026-07-01T00:00:00Z"), h("pork", 2, true, "2026-08-20T00:00:00Z")],
  });
  assert.equal(out?.status, "unset");
  if (out?.status !== "unset") return;
  assert.equal(out.month, "2026-07");
  assert.deepEqual(out.unsetIngredients, [{ name: "豚肉", viaPrepItemName: null }]);
  assert.equal(formatPriceChangeUnsetReason(out), "計算できていません(未設定: 豚肉。2026年7月時点で未設定だったため)");
});

test("P4 豚肉は5月末まで未設定、6/1から設定(4〜5月にも販売あり): 基準は直近3か月(6〜8月)なので計算でき、累計+23,000円", () => {
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: priceHistory,
    menuSales: sales([
      { month: "2026-04", qty: 100 },
      { month: "2026-05", qty: 100 },
    ]),
    menuIngredientLines: [{ ingredientId: "pork", quantity: 150 }],
    ingredients: [pork],
    prepItemComponents: [],
    ingredientPriceHistory: [h("pork", 0, false, "2026-03-01T00:00:00Z"), h("pork", 2, true, "2026-06-01T00:00:00Z")],
  });
  assert.equal(out?.status, "ok");
  if (out?.status !== "ok") return;
  assert.equal(out.result.baselineMonthCount, 3);
  assert.equal(out.result.cumulativeImprovement, 23_000);
});

test("P5 仕込み品タレの材料みりんが未設定: 計算できていません(未設定: みりん(タレの材料))", () => {
  const soy = { id: "soy", name: "醤油", currentPurchasePrice: 0.5, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null };
  const mirin = { id: "mirin", name: "みりん", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null };
  const sauce = { id: "sauce", name: "タレ", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 200 };
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: priceHistory,
    menuSales: sales(),
    menuIngredientLines: [
      { ingredientId: "pork", quantity: 150 },
      { ingredientId: "sauce", quantity: 50 },
    ],
    ingredients: [pork, soy, mirin, sauce],
    prepItemComponents: [
      { prepItemId: "sauce", componentId: "soy", quantity: 100 },
      { prepItemId: "sauce", componentId: "mirin", quantity: 100 },
    ],
    ingredientPriceHistory: [
      h("pork", 2, true, "2026-01-01T00:00:00Z"),
      h("soy", 0.5, true, "2026-01-01T00:00:00Z"),
      h("mirin", 0, false, "2026-01-01T00:00:00Z"),
    ],
  });
  assert.equal(out?.status, "unset");
  if (out?.status !== "unset") return;
  assert.deepEqual(out.unsetIngredients, [{ name: "みりん", viaPrepItemName: "タレ" }]);
  assert.equal(formatPriceChangeUnsetReason(out), "計算できていません(未設定: みりん(タレの材料)。2026年6月時点で未設定だったため)");
});

test("売価の変更が1回も無い(履歴が1件以下)ときは何も表示しない(null)", () => {
  const out = evaluateMenuPriceChangeImpact({
    menuPriceHistory: [priceHistory[0]],
    menuSales: sales(),
    menuIngredientLines: [{ ingredientId: "pork", quantity: 150 }],
    ingredients: [pork],
    prepItemComponents: [],
    ingredientPriceHistory: [],
  });
  assert.equal(out, null);
});
