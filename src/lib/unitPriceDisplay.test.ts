import { test } from "node:test";
import assert from "node:assert/strict";
import { unitPriceDisplay, unitPriceLabel } from "./unitPriceDisplay.ts";
import { withResolvedPrepItemPrices } from "./prepItemCost.ts";

/**
 * 食材一覧・メニュー編集(食材候補・追加済みの行・既存の食材を選んだ時の案内)の単価表示
 * (検算済みのテストケースI1〜I5)。
 * 以前は単価未設定の食材が「gあたり¥0」、材料に未設定を含む仕込み品が0円扱いの安い単価で
 * 表示されていた。
 */

const fmt = (n: number) => `¥${Math.round(n * 100) / 100}`;

const ingredients = [
  { id: "yuzu", name: "柚子", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  { id: "zero", name: "お通しの塩", currentPurchasePrice: 0, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  { id: "pork", name: "豚肉", currentPurchasePrice: 1.5, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  { id: "soy", name: "醤油", currentPurchasePrice: 0.5, priceIsSet: true, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  { id: "mirin", name: "みりん", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: false, yieldQuantity: null },
  { id: "sauce", name: "タレ", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 200 },
  // タレ(未設定を含む)を材料に使う仕込み品(入れ子)
  { id: "marinade", name: "漬けダレ", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 300 },
  // 材料がすべて設定済みの仕込み品
  { id: "dashi", name: "合わせだし", currentPurchasePrice: 0, priceIsSet: false, yieldRatePercent: 100, isPrepItem: true, yieldQuantity: 100 },
];
const components = [
  { prepItemId: "sauce", componentId: "soy", quantity: 100 },
  { prepItemId: "sauce", componentId: "mirin", quantity: 100 },
  { prepItemId: "marinade", componentId: "sauce", quantity: 100 },
  { prepItemId: "marinade", componentId: "soy", quantity: 200 },
  { prepItemId: "dashi", componentId: "soy", quantity: 20 },
];
const resolved = new Map(withResolvedPrepItemPrices(ingredients, components).map((i) => [i.id, i]));
const label = (id: string, unit: string) => unitPriceLabel(unit, unitPriceDisplay(resolved.get(id)!), fmt);

test("I1 単価未設定の柚子: 「gあたり 未設定」(金額は出さない)", () => {
  assert.equal(label("yuzu", "g"), "gあたり 未設定");
});

test("I2 0円と明示して設定済み: 「gあたり¥0」(今のまま)", () => {
  assert.equal(label("zero", "g"), "gあたり¥0");
});

test("I3 材料のみりんが未設定の仕込み品タレ: 「mlあたり 未設定を含む」(0円扱いの単価は出さない)", () => {
  assert.equal(label("sauce", "ml"), "mlあたり 未設定を含む");
});

test("I4 材料の仕込み品が未設定を含む(入れ子): 「未設定を含む」", () => {
  assert.equal(label("marinade", "ml"), "mlあたり 未設定を含む");
});

test("I5 普通の設定済みの食材: 今のまま(「gあたり¥1.5」)。材料がすべて設定済みの仕込み品も単価を出す", () => {
  assert.equal(label("pork", "g"), "gあたり¥1.5");
  assert.equal(label("dashi", "ml"), "mlあたり¥0.1");
});
