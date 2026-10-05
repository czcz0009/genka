import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuRanking, findPriceHeadroomMenus } from "./menuRanking.ts";
import { aggregateSalesAndFoodCost, calcFlRatios } from "./flRatio.ts";
import { calcRequiredSellingPrice, calcSuggestedPriceIncrease, calcCostRate } from "./costCalc.ts";
import { calcPriceChangeImpact } from "./priceChangeImpact.ts";
import { withResolvedPrepItemPrices, resolveUnsetLeaves } from "./prepItemCost.ts";
import { generateMarketPriceAlerts } from "./marketPrices/generateAlerts.ts";
import type { PriceChangeEvent } from "./marketPrices/detectPriceChanges.ts";
import type { IngredientItemMatch } from "./marketPrices/matchIngredientToItem.ts";

/**
 * カテゴリ機能(0025)で、メニュー・食材にcategoryIdが付くようになっても、
 * 次の数字が一切変わらないことを確認する:
 *   原価計算 / FL比率 / 今見直すべきメニュー / 仕入れ値アラート / 値上げシミュレーション
 *
 * 方法: 同じ店舗データについて
 *   (A) カテゴリなし(従来どおり、categoryIdという項目自体が無い)
 *   (B) 全部未分類(categoryId = null)
 *   (C) いろいろなカテゴリを付けた状態
 * の3通りで各画面と同じ計算を通し、結果がcategoryId以外すべて一致することを確かめる。
 * あわせて(A)の結果を、手計算できる固定値(検算セット)とも照合する。
 */

// ---- 店舗データ(検算しやすい数字にしている) ----
const baseIngredients = [
  { id: "ing-pork", name: "豚肉", currentPurchasePrice: 2, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null }, // 2円/g
  { id: "ing-onion", name: "たまねぎ", currentPurchasePrice: 0.2, priceIsSet: true, yieldRatePercent: 80, isPrepItem: false, yieldQuantity: null }, // 歩留まり80% → 実質0.25円/g
  { id: "ing-soy", name: "醤油", currentPurchasePrice: 0.5, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null }, // 0.5円/ml
  { id: "ing-mirin", name: "みりん", currentPurchasePrice: 0.3, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null }, // 0.3円/ml
  { id: "ing-sauce", name: "生姜焼きのタレ", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 200 }, // 仕込み品
  { id: "ing-yuzu", name: "柚子", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null }, // 単価未設定
];
// タレ200ml = 醤油100ml(50円) + みりん100ml(30円) = 80円 → 0.4円/ml
const prepItemComponents = [
  { prepItemId: "ing-sauce", componentId: "ing-soy", quantity: 100 },
  { prepItemId: "ing-sauce", componentId: "ing-mirin", quantity: 100 },
];
const baseMenus = [
  { id: "m-ginger", name: "生姜焼き定食", sellingPrice: 1000, targetCostRate: null }, // 店舗の目標30%
  { id: "m-onion", name: "オニオンスライス", sellingPrice: 300, targetCostRate: 25 },
  { id: "m-yuzu", name: "柚子シャーベット", sellingPrice: 400, targetCostRate: null }, // 単価未設定の食材を使う
  { id: "m-noprice", name: "まかない", sellingPrice: null, targetCostRate: null }, // 売価未設定
];
const menuIngredients = [
  { menuId: "m-ginger", ingredientId: "ing-pork", quantity: 150 }, // 300円
  { menuId: "m-ginger", ingredientId: "ing-onion", quantity: 40 }, // 10円
  { menuId: "m-ginger", ingredientId: "ing-sauce", quantity: 50 }, // 20円 → 合計330円、原価率33%
  { menuId: "m-onion", ingredientId: "ing-onion", quantity: 100 }, // 25円 → 原価率約8.33%
  { menuId: "m-yuzu", ingredientId: "ing-yuzu", quantity: 30 },
  { menuId: "m-noprice", ingredientId: "ing-pork", quantity: 100 },
];
const sales = [
  { menuId: "m-ginger", quantitySold: 300 },
  { menuId: "m-onion", quantitySold: 100 },
  { menuId: "m-yuzu", quantitySold: 50 },
];
const DEFAULT_TARGET = 30;

// ---- 3通りのカテゴリの付け方 ----
type Variant = "none" | "allNull" | "assigned";
const menuCategory: Record<string, string> = { "m-ginger": "c-main", "m-onion": "c-side", "m-yuzu": "c-dessert" };
const ingredientCategory: Record<string, string> = {
  "ing-pork": "c-meat",
  "ing-onion": "c-veg",
  "ing-soy": "c-seasoning",
  "ing-sauce": "c-seasoning", // 仕込み品にカテゴリが付いていても(画面では付けないが)計算は変わらない
};

function withCategories<T extends { id: string }>(rows: T[], variant: Variant, map: Record<string, string>) {
  if (variant === "none") return rows.map((r) => ({ ...r }));
  return rows.map((r) => ({ ...r, categoryId: variant === "allNull" ? null : (map[r.id] ?? null) }));
}

/** 各画面と同じ順序で計算を通し、表示に使う結果をまとめて返す。 */
function runAllCalculations(variant: Variant) {
  const menus = withCategories(baseMenus, variant, menuCategory);
  const ingredients = withCategories(baseIngredients, variant, ingredientCategory);

  // 仕込み品の単価解決(メニュー一覧・ランキング・FL比率・アラート共通)
  const resolvedIngredients = withResolvedPrepItemPrices(ingredients, prepItemComponents);
  const unsetLeavesByIngredientId = resolveUnsetLeaves(ingredients, prepItemComponents);

  // 原価計算・今見直すべきメニュー
  const ranking = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: resolvedIngredients,
    sales,
    defaultTargetCostRate: DEFAULT_TARGET,
    unsetLeavesByIngredientId,
  });
  const headroom = findPriceHeadroomMenus(ranking);

  // FL比率
  const aggregated = aggregateSalesAndFoodCost(ranking);
  const fl = calcFlRatios({
    totalSales: aggregated.totalSales,
    totalFoodCost: aggregated.totalFoodCost,
    laborCost: 90_000,
    rentCost: 40_000,
    lossAmount: 6_000,
  });

  // 仕入れ値アラート(たまねぎの市場価格が50%上がった場合)
  const priceChange: PriceChangeEvent = {
    itemCode: "36610",
    itemName: "たまねぎ",
    oldPricePerKg: 200,
    newPricePerKg: 300,
    changePercent: 50,
    direction: "up",
  };
  const match: IngredientItemMatch = {
    ingredientId: "ing-onion",
    ingredientName: "たまねぎ",
    itemCode: "36610",
    itemName: "たまねぎ",
    confidence: "high",
    method: "exact",
    score: 1,
  };
  const alerts = generateMarketPriceAlerts({
    priceChanges: [priceChange],
    matches: [match],
    ingredients: resolvedIngredients,
    menus,
    menuIngredients,
    defaultTargetCostRate: DEFAULT_TARGET,
    unsetLeavesByIngredientId,
  });

  // 値上げシミュレーション(メニュー編集画面と同じ計算: 試算価格での原価率・必要売価・値上げ目安)
  const simulation = ranking.map((s) => ({
    menuId: s.menuId,
    simulatedCostRateAt1100: calcCostRate(s.totalCost, 1100),
    requiredPrice: calcRequiredSellingPrice(s.totalCost, s.targetCostRate),
    suggestedIncrease: calcSuggestedPriceIncrease(s.totalCost, s.sellingPrice, s.targetCostRate),
  }));

  // 値上げの効果追跡(メニュー詳細画面)
  const ginger = ranking.find((s) => s.menuId === "m-ginger")!;
  const impact = calcPriceChangeImpact(
    1000,
    1100,
    [{ month: "2026-08", quantitySold: 300, profitPerUnit: 1000 - ginger.totalCost }],
    [{ month: "2026-09", quantitySold: 280, profitPerUnit: 1100 - ginger.totalCost }],
  );

  return { resolvedIngredients, ranking, headroom, aggregated, fl, alerts, simulation, impact };
}

/** 比較のため、結果の中のcategoryId(入力からそのまま引き継がれる場合がある)を取り除く。 */
function stripCategoryId(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCategoryId);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, stripCategoryId(v)]));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== "categoryId")
        .map(([k, v]) => [k, stripCategoryId(v)]),
    );
  }
  return value;
}

test("カテゴリなし・全部未分類・カテゴリあり の3通りで、全画面の計算結果が完全に一致する", () => {
  const none = stripCategoryId(runAllCalculations("none"));
  assert.deepEqual(stripCategoryId(runAllCalculations("allNull")), none);
  assert.deepEqual(stripCategoryId(runAllCalculations("assigned")), none);
});

test("カテゴリを付けても、今見直すべきメニューの並び順は変わらない", () => {
  const order = (v: Variant) => runAllCalculations(v).ranking.map((s) => s.menuId);
  assert.deepEqual(order("assigned"), order("none"));
  assert.deepEqual(order("allNull"), order("none"));
});

// ---- 検算セット(手計算の値と照合。カテゴリ導入の前後で同じ値であること) ----
test("検算: 生姜焼き定食の原価は330円(豚肉300円+たまねぎ10円+タレ20円)、原価率33%、目標30%超え", () => {
  const { ranking } = runAllCalculations("assigned");
  const g = ranking.find((s) => s.menuId === "m-ginger")!;
  assert.ok(Math.abs(g.totalCost - 330) < 1e-9);
  assert.ok(Math.abs(g.costRate! - 33) < 1e-9);
  assert.equal(g.targetCostRate, 30);
  assert.equal(g.overTarget, true);
});

test("検算: 仕込み品のタレは200mlで80円 → 1mlあたり0.4円", () => {
  const { resolvedIngredients } = runAllCalculations("assigned");
  const sauce = resolvedIngredients.find((i) => i.id === "ing-sauce")!;
  assert.ok(Math.abs(sauce.currentPurchasePrice - 0.4) < 1e-9);
});

test("検算: 値上げシミュレーション — 生姜焼き定食の必要売価は1100円(330÷0.3)、値上げ目安は+100円", () => {
  const { simulation } = runAllCalculations("assigned");
  const g = simulation.find((s) => s.menuId === "m-ginger")!;
  assert.equal(g.requiredPrice, 1100);
  assert.equal(g.suggestedIncrease, 100);
  assert.ok(Math.abs(g.simulatedCostRateAt1100! - 30) < 1e-9);
});

test("検算: FL比率 — 売上35万円・食材原価10.15万円(単価未設定の柚子シャーベットは原価から除外)", () => {
  // 売上: 1000×300 + 300×100 + 400×50 = 350,000円(売価未設定のまかないは除く)
  // 食材原価: 330×300 + 25×100 = 101,500円(柚子シャーベットは単価未設定のため除外)
  const { aggregated, fl } = runAllCalculations("assigned");
  assert.equal(aggregated.totalSales, 350_000);
  assert.ok(Math.abs(aggregated.totalFoodCost - 101_500) < 1e-6);
  assert.equal(aggregated.excludedMenuCount, 1);
  assert.ok(fl.foodCostRate != null);
});

test("検算: 仕入れ値アラート — たまねぎ+50%で、たまねぎを使う2メニューが影響を受ける", () => {
  const { alerts } = runAllCalculations("assigned");
  assert.equal(alerts.alerts.length, 1);
  assert.deepEqual(alerts.alerts[0].affectedMenus.map((m) => m.menuId).sort(), ["m-ginger", "m-onion"]);
});
