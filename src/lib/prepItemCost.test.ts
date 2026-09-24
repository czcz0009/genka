import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveIngredientPrices, wouldCreateCycle, withResolvedPrepItemPrices } from "./prepItemCost.ts";
import type { CostIngredient, PrepItemComponentLine, PrepItemEdge } from "./prepItemCost.ts";

function ingredient(partial: Partial<CostIngredient> & { id: string }): CostIngredient {
  return {
    isPrepItem: false,
    currentPurchasePrice: 0,
    yieldRatePercent: 100,
    yieldQuantity: null,
    ...partial,
  };
}

test("resolveEffectiveIngredientPrices: 通常の食材は従来通りの実質単価になる(回帰確認)", () => {
  const prices = resolveEffectiveIngredientPrices(
    [ingredient({ id: "pork", currentPurchasePrice: 2, yieldRatePercent: 80 })],
    [],
  );
  // 歩留まり80%: 2 ÷ 0.8 = 2.5
  assert.equal(prices.get("pork"), 2.5);
});

test("resolveEffectiveIngredientPrices: 仕込み品(出汁)の単価を材料費÷仕込み量で計算する", () => {
  const ingredients = [
    ingredient({ id: "kombu", currentPurchasePrice: 2 }),
    ingredient({ id: "katsuobushi", currentPurchasePrice: 4 }),
    ingredient({ id: "dashi", isPrepItem: true, yieldQuantity: 10000 }),
  ];
  const components: PrepItemComponentLine[] = [
    { prepItemId: "dashi", componentId: "kombu", quantity: 1000 },
    { prepItemId: "dashi", componentId: "katsuobushi", quantity: 500 },
  ];
  const prices = resolveEffectiveIngredientPrices(ingredients, components);
  // 材料費 = 1000×2 + 500×4 = 4000円、4000 ÷ 10000ml = 0.4円/ml
  assert.equal(prices.get("dashi"), 0.4);
});

test("resolveEffectiveIngredientPrices: 元の食材が値上がりすると仕込み品の単価も追従する", () => {
  const ingredients = [
    ingredient({ id: "kombu", currentPurchasePrice: 3 }), // 2円→3円に値上がり
    ingredient({ id: "katsuobushi", currentPurchasePrice: 4 }),
    ingredient({ id: "dashi", isPrepItem: true, yieldQuantity: 10000 }),
  ];
  const components: PrepItemComponentLine[] = [
    { prepItemId: "dashi", componentId: "kombu", quantity: 1000 },
    { prepItemId: "dashi", componentId: "katsuobushi", quantity: 500 },
  ];
  const prices = resolveEffectiveIngredientPrices(ingredients, components);
  // 材料費 = 1000×3 + 500×4 = 5000円、5000 ÷ 10000ml = 0.5円/ml
  assert.equal(prices.get("dashi"), 0.5);
});

test("resolveEffectiveIngredientPrices: 仕込み品が別の仕込み品を含む(入れ子)場合も再帰的に計算する", () => {
  const ingredients = [
    ingredient({ id: "kombu", currentPurchasePrice: 2 }),
    ingredient({ id: "katsuobushi", currentPurchasePrice: 4 }),
    ingredient({ id: "dashi", isPrepItem: true, yieldQuantity: 10000 }), // 0.4円/ml
    ingredient({ id: "sauce", isPrepItem: true, yieldQuantity: 1000 }),
  ];
  const components: PrepItemComponentLine[] = [
    { prepItemId: "dashi", componentId: "kombu", quantity: 1000 },
    { prepItemId: "dashi", componentId: "katsuobushi", quantity: 500 },
    { prepItemId: "sauce", componentId: "dashi", quantity: 500 }, // 出汁500ml使う
  ];
  const prices = resolveEffectiveIngredientPrices(ingredients, components);
  // sauceの材料費 = 出汁0.4円/ml × 500ml = 200円、200 ÷ 1000ml = 0.2円/ml
  assert.equal(prices.get("dashi"), 0.4);
  assert.equal(prices.get("sauce"), 0.2);
});

test("resolveEffectiveIngredientPrices: 循環参照があっても無限ループにならず0円として扱う(保険)", () => {
  const ingredients = [
    ingredient({ id: "a", isPrepItem: true, yieldQuantity: 100 }),
    ingredient({ id: "b", isPrepItem: true, yieldQuantity: 100 }),
  ];
  const components: PrepItemComponentLine[] = [
    { prepItemId: "a", componentId: "b", quantity: 10 },
    { prepItemId: "b", componentId: "a", quantity: 10 },
  ];
  const prices = resolveEffectiveIngredientPrices(ingredients, components);
  assert.equal(prices.get("a"), 0);
  assert.equal(prices.get("b"), 0);
});

test("withResolvedPrepItemPrices: 通常の食材はそのまま、仕込み品だけ実質単価に差し替える", () => {
  const rows = [
    { id: "kombu", currentPurchasePrice: 2, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
    { id: "katsuobushi", currentPurchasePrice: 4, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
    { id: "dashi", currentPurchasePrice: 0, yieldRatePercent: null, isPrepItem: true, yieldQuantity: 10000 },
  ];
  const components: PrepItemComponentLine[] = [
    { prepItemId: "dashi", componentId: "kombu", quantity: 1000 },
    { prepItemId: "dashi", componentId: "katsuobushi", quantity: 500 },
  ];
  const result = withResolvedPrepItemPrices(rows, components);
  assert.equal(result.find((r) => r.id === "kombu")?.currentPurchasePrice, 2); // 通常の食材は不変
  const dashi = result.find((r) => r.id === "dashi");
  assert.equal(dashi?.currentPurchasePrice, 0.4);
  assert.equal(dashi?.yieldRatePercent, 100); // 二重の歩留まり適用を避けるため100に固定
});

test("wouldCreateCycle: 循環していなければfalse", () => {
  const existingEdges: PrepItemEdge[] = [];
  assert.equal(wouldCreateCycle("dashi", ["kombu", "katsuobushi"], existingEdges), false);
});

test("wouldCreateCycle: 自分自身を材料に含めるとtrue", () => {
  assert.equal(wouldCreateCycle("dashi", ["dashi"], []), true);
});

test("wouldCreateCycle: 間接的な循環(AがBを含み、BがAを含む)はtrue", () => {
  // 既にB→Aの参照がある状態で、AにBを追加しようとするケース
  const existingEdges: PrepItemEdge[] = [{ prepItemId: "b", componentId: "a" }];
  assert.equal(wouldCreateCycle("a", ["b"], existingEdges), true);
});

test("wouldCreateCycle: ダイヤモンド型の参照(循環ではない)はfalse", () => {
  // a → b, a → c, b → d, c → d という非循環構造にaを保存する場合
  const existingEdges: PrepItemEdge[] = [
    { prepItemId: "b", componentId: "d" },
    { prepItemId: "c", componentId: "d" },
  ];
  assert.equal(wouldCreateCycle("a", ["b", "c"], existingEdges), false);
});
