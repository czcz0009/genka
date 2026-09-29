import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcMenuTotalCost,
  calcCostRate,
  calcSuggestedPriceIncrease,
  calcRequiredSellingPrice,
  calcEffectiveUnitPrice,
  type UnitPriceMap,
} from "./costCalc.ts";

test("calcMenuTotalCost: 各食材の分量×単価を合計する(A: 全食材が設定済み)", () => {
  const lines = [
    { ingredientId: "pasta", quantity: 120 },
    { ingredientId: "ketchup", quantity: 30 },
  ];
  const prices: UnitPriceMap = new Map([
    ["pasta", { price: 0.8, isSet: true }], // 円/g
    ["ketchup", { price: 0.5, isSet: true }],
  ]);
  const result = calcMenuTotalCost(lines, prices);
  assert.ok(Math.abs(result.totalCost - (120 * 0.8 + 30 * 0.5)) < 1e-9);
  assert.deepEqual(result.unsetIngredientIds, []);
});

test("calcMenuTotalCost: 単価一覧に無い食材は0円として合計し、未設定として報告する(異常系)", () => {
  const lines = [{ ingredientId: "unknown", quantity: 100 }];
  const result = calcMenuTotalCost(lines, new Map());
  assert.equal(result.totalCost, 0);
  assert.deepEqual(result.unsetIngredientIds, ["unknown"]);
});

test("calcMenuTotalCost: B相当(一部の食材が単価未設定)。合計は参考値として計算するが未設定として報告する", () => {
  const lines = [
    { ingredientId: "ginger", quantity: 5 }, // 生姜5g、未設定
    { ingredientId: "chicken", quantity: 200 }, // 鶏もも肉200g、1.2円/g
  ];
  const prices: UnitPriceMap = new Map([
    ["ginger", { price: 0, isSet: false }],
    ["chicken", { price: 1.2, isSet: true }],
  ]);
  const result = calcMenuTotalCost(lines, prices);
  assert.equal(result.totalCost, 240); // 内部の参考値(画面には出さない)
  assert.deepEqual(result.unsetIngredientIds, ["ginger"]);
});

test("calcMenuTotalCost: C相当(唯一の食材が単価未設定)。0%ではなく未設定として報告する", () => {
  const lines = [{ ingredientId: "cabbage", quantity: 50 }];
  const prices: UnitPriceMap = new Map([["cabbage", { price: 0, isSet: false }]]);
  const result = calcMenuTotalCost(lines, prices);
  assert.equal(result.totalCost, 0);
  assert.deepEqual(result.unsetIngredientIds, ["cabbage"]);
});

test("calcMenuTotalCost: E相当(0円と明示された食材はisSet=trueとして正しく計算に入る)", () => {
  const lines = [
    { ingredientId: "kombu", quantity: 10 }, // 昆布10g×2円/g
    { ingredientId: "katsuobushi", quantity: 5 }, // かつお節5g×4円/g
    { ingredientId: "water", quantity: 300 }, // 水300ml×0円/ml(明示)
  ];
  const prices: UnitPriceMap = new Map([
    ["kombu", { price: 2, isSet: true }],
    ["katsuobushi", { price: 4, isSet: true }],
    ["water", { price: 0, isSet: true }],
  ]);
  const result = calcMenuTotalCost(lines, prices);
  assert.equal(result.totalCost, 40);
  assert.deepEqual(result.unsetIngredientIds, []);
});

test("calcMenuTotalCost: F相当(Eと同条件で水が未設定)。原価は計算せず未設定として報告する", () => {
  const lines = [
    { ingredientId: "kombu", quantity: 10 },
    { ingredientId: "katsuobushi", quantity: 5 },
    { ingredientId: "water", quantity: 300 },
  ];
  const prices: UnitPriceMap = new Map([
    ["kombu", { price: 2, isSet: true }],
    ["katsuobushi", { price: 4, isSet: true }],
    ["water", { price: 0, isSet: false }],
  ]);
  const result = calcMenuTotalCost(lines, prices);
  assert.deepEqual(result.unsetIngredientIds, ["water"]);
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
