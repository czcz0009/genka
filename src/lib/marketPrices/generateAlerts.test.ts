import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMarketPriceAlerts } from "./generateAlerts.ts";
import type { PriceChangeEvent } from "./detectPriceChanges.ts";
import type { IngredientItemMatch } from "./matchIngredientToItem.ts";

const onionPriceChange: PriceChangeEvent = {
  itemCode: "36610",
  itemName: "たまねぎ",
  oldPricePerKg: 200,
  newPricePerKg: 300,
  changePercent: 50,
  direction: "up",
};

const onionMatch: IngredientItemMatch = {
  ingredientId: "ing-onion",
  ingredientName: "たまねぎ",
  itemCode: "36610",
  itemName: "たまねぎ",
  confidence: "high",
  method: "exact",
  score: 1,
};

const ingredients = [
  { id: "ing-onion", name: "たまねぎ", currentPurchasePrice: 0.2 }, // 円/g (200円/kg)
  { id: "ing-rice", name: "米", currentPurchasePrice: 0.3 },
];

const menuIngredients = [
  { menuId: "menu-a", ingredientId: "ing-onion", quantity: 200 },
  { menuId: "menu-a", ingredientId: "ing-rice", quantity: 200 },
  { menuId: "menu-b", ingredientId: "ing-onion", quantity: 200 },
  { menuId: "menu-b", ingredientId: "ing-rice", quantity: 200 },
];

test("目標原価率を超えなかったメニューが、市場価格の試算では超える見込みになったことを検知する", () => {
  const menus = [
    { id: "menu-a", name: "カレーライス", sellingPrice: 800, targetCostRate: 13 },
    { id: "menu-b", name: "オニオンスープ", sellingPrice: 2000, targetCostRate: 30 },
  ];

  const { alerts } = generateMarketPriceAlerts({
    priceChanges: [onionPriceChange],
    matches: [onionMatch],
    ingredients,
    menus,
    menuIngredients,
    defaultTargetCostRate: 30,
  });

  assert.equal(alerts.length, 1);
  const alert = alerts[0];
  assert.equal(alert.ingredientName, "たまねぎ");
  assert.equal(alert.direction, "up");
  assert.equal(alert.affectedMenus.length, 2);

  const menuA = alert.affectedMenus.find((m) => m.menuId === "menu-a")!;
  assert.ok(Math.abs(menuA.oldCostRate! - 12.5) < 0.001);
  assert.ok(Math.abs(menuA.projectedCostRate! - 15) < 0.001);
  assert.equal(menuA.newlyOverTarget, true);

  const menuB = alert.affectedMenus.find((m) => m.menuId === "menu-b")!;
  assert.equal(menuB.newlyOverTarget, false);

  assert.match(alert.message, /たまねぎ/);
  assert.match(alert.message, /値上がり/);
  assert.match(alert.message, /カレーライス/);
  assert.match(alert.message, /試算/);
});

test("メニュー個別の目標原価率が未設定ならdefaultTargetCostRateを使う", () => {
  const menus = [{ id: "menu-a", name: "カレーライス", sellingPrice: 800, targetCostRate: null }];
  const { alerts } = generateMarketPriceAlerts({
    priceChanges: [onionPriceChange],
    matches: [onionMatch],
    ingredients,
    menus,
    menuIngredients: menuIngredients.filter((mi) => mi.menuId === "menu-a"),
    defaultTargetCostRate: 13,
  });
  assert.equal(alerts[0].affectedMenus[0].targetCostRate, 13);
  assert.equal(alerts[0].affectedMenus[0].newlyOverTarget, true);
});

test("確信度lowのマッチは通知せず、要確認候補として返す", () => {
  const lowMatch: IngredientItemMatch = { ...onionMatch, confidence: "low", method: "fuzzy", score: 0.55 };
  const { alerts, needsReviewMatches } = generateMarketPriceAlerts({
    priceChanges: [onionPriceChange],
    matches: [lowMatch],
    ingredients,
    menus: [{ id: "menu-a", name: "カレーライス", sellingPrice: 800, targetCostRate: 30 }],
    menuIngredients,
    defaultTargetCostRate: 30,
  });
  assert.equal(alerts.length, 0);
  assert.equal(needsReviewMatches.length, 1);
});

test("今回の変動対象になっていない品目のマッチは通知しない", () => {
  const { alerts } = generateMarketPriceAlerts({
    priceChanges: [], // 変動なし
    matches: [onionMatch],
    ingredients,
    menus: [{ id: "menu-a", name: "カレーライス", sellingPrice: 800, targetCostRate: 30 }],
    menuIngredients,
    defaultTargetCostRate: 30,
  });
  assert.equal(alerts.length, 0);
});

test("その食材を使っているメニューが1つもない場合、影響メニューは空だがアラート自体は生成する", () => {
  const { alerts } = generateMarketPriceAlerts({
    priceChanges: [onionPriceChange],
    matches: [onionMatch],
    ingredients,
    menus: [],
    menuIngredients: [],
    defaultTargetCostRate: 30,
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].affectedMenus.length, 0);
});
