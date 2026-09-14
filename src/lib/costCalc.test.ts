import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcMenuTotalCost,
  calcCostRate,
  calcSuggestedPriceIncrease,
  calcRequiredSellingPrice,
  calcEffectiveUnitPrice,
} from "./costCalc.ts";

test("calcMenuTotalCost: 各食材の分量×単価を合計する", () => {
  const lines = [
    { ingredientId: "pasta", quantity: 120 },
    { ingredientId: "ketchup", quantity: 30 },
  ];
  const prices = new Map([
    ["pasta", 0.8], // 円/g
    ["ketchup", 0.5],
  ]);
  const total = calcMenuTotalCost(lines, prices);
  assert.ok(Math.abs(total - (120 * 0.8 + 30 * 0.5)) < 1e-9);
});

test("calcMenuTotalCost: 単価が見つからない食材は0円として無視する", () => {
  const lines = [{ ingredientId: "unknown", quantity: 100 }];
  const total = calcMenuTotalCost(lines, new Map());
  assert.equal(total, 0);
});

test("calcCostRate: 原価÷売価×100", () => {
  assert.ok(Math.abs(calcCostRate(300, 900)! - 100 / 3) < 1e-9);
});

test("calcCostRate: 売価がnullまたは0以下ならnull(計算不能)", () => {
  assert.equal(calcCostRate(300, null), null);
  assert.equal(calcCostRate(300, 0), null);
  assert.equal(calcCostRate(300, -100), null);
});

test("calcSuggestedPriceIncrease: 目標原価率まで下げるのに必要な値上げ額を10円単位で切り上げる", () => {
  // 原価300円・売価900円(原価率33.3%)を目標30%に収めるには売価1000円必要 -> +100円
  assert.equal(calcSuggestedPriceIncrease(300, 900, 30), 100);
});

test("calcSuggestedPriceIncrease: 端数はroundTo単位で必ず切り上げる(切り捨てると未達になるため)", () => {
  // 必要売価は1033.33...円 -> 差額133.33円 -> 10円単位で切り上げて140円
  assert.equal(calcSuggestedPriceIncrease(310, 900, 30), 140);
});

test("calcSuggestedPriceIncrease: すでに目標原価率以下なら0(値上げ不要)", () => {
  assert.equal(calcSuggestedPriceIncrease(200, 900, 30), 0);
});

test("calcSuggestedPriceIncrease: 売価未設定・目標原価率が0以下なら計算不能でnull", () => {
  assert.equal(calcSuggestedPriceIncrease(300, null, 30), null);
  assert.equal(calcSuggestedPriceIncrease(300, 900, 0), null);
});

test("calcSuggestedPriceIncrease: roundToを変更できる", () => {
  assert.equal(calcSuggestedPriceIncrease(300, 900, 30, 50), 100);
  assert.equal(calcSuggestedPriceIncrease(310, 900, 30, 50), 150);
});

test("calcRequiredSellingPrice: 原価÷(目標原価率/100)を10円単位で切り上げる", () => {
  // 原価300円・目標30% -> 必要売価は300/0.3=1000円(すでにちょうど10円単位)
  assert.equal(calcRequiredSellingPrice(300, 30), 1000);
});

test("calcRequiredSellingPrice: 端数は必ず切り上げる(切り捨てると未達になるため)", () => {
  // 原価310円・目標30% -> 必要売価は310/0.3=1033.33...円 -> 切り上げて1040円
  assert.equal(calcRequiredSellingPrice(310, 30), 1040);
});

test("calcRequiredSellingPrice: 現在の売価には依存しない(calcSuggestedPriceIncreaseとの違い)", () => {
  // 売価が905円(10円の倍数でない)でも、必要売価そのものは常に同じ1000円になる
  const required = calcRequiredSellingPrice(300, 30);
  assert.equal(required, 1000);
});

test("calcRequiredSellingPrice: 原価が0円なら必要売価も0円", () => {
  assert.equal(calcRequiredSellingPrice(0, 30), 0);
});

test("calcRequiredSellingPrice: 目標原価率が0以下、または原価が負ならnull(計算不能)", () => {
  assert.equal(calcRequiredSellingPrice(300, 0), null);
  assert.equal(calcRequiredSellingPrice(-100, 30), null);
});

test("calcRequiredSellingPrice: roundToを変更できる", () => {
  assert.equal(calcRequiredSellingPrice(300, 30, 50), 1000);
  assert.equal(calcRequiredSellingPrice(310, 30, 50), 1050);
});

test("calcEffectiveUnitPrice: 歩留まり率未指定なら仕入単価をそのまま返す(従来通り)", () => {
  assert.equal(calcEffectiveUnitPrice(800), 800);
  assert.equal(calcEffectiveUnitPrice(800, null), 800);
});

test("calcEffectiveUnitPrice: 歩留まり率100%なら仕入単価をそのまま返す", () => {
  assert.equal(calcEffectiveUnitPrice(800, 100), 800);
});

test("calcEffectiveUnitPrice: 歩留まり率70%なら仕入単価を0.7で割った額になる", () => {
  // 1尾800円(1000gあたり)・歩留まり70% -> 実質1143.28...円(1000gあたり)
  const result = calcEffectiveUnitPrice(800, 70);
  assert.ok(Math.abs(result - 800 / 0.7) < 1e-9);
  assert.ok(Math.abs(result - 1142.857142857143) < 1e-6);
});

test("calcEffectiveUnitPrice: 歩留まり率が0以下・100超などの不正値は仕入単価をそのまま返す(0除算防止)", () => {
  assert.equal(calcEffectiveUnitPrice(800, 0), 800);
  assert.equal(calcEffectiveUnitPrice(800, -10), 800);
  assert.equal(calcEffectiveUnitPrice(800, 150), 800);
});
