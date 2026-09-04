import { test } from "node:test";
import assert from "node:assert/strict";
import { calcMenuTotalCost, calcCostRate, calcSuggestedPriceIncrease } from "./costCalc.ts";

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
