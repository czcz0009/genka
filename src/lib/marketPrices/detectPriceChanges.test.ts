import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPriceChanges } from "./detectPriceChanges.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

function item(partial: Partial<SyuyoItem> & { itemCode: string; itemName: string }): SyuyoItem {
  return {
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg: null,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
    ...partial,
  };
}

test("閾値を超える値上がりを検知する", () => {
  const previous = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 100 })];
  const current = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 120 })]; // +20%
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "up");
  assert.ok(Math.abs(events[0].changePercent - 20) < 0.001);
});

test("閾値を超える値下がりも検知する", () => {
  const previous = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 100 })];
  const current = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 80 })]; // -20%
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "down");
  assert.ok(Math.abs(events[0].changePercent - -20) < 0.001);
});

test("閾値未満の変動は検知しない", () => {
  const previous = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 100 })];
  const current = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 105 })]; // +5%
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 0);
});

test("閾値はカスタマイズできる", () => {
  const previous = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 100 })];
  const current = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 105 })]; // +5%
  const events = detectPriceChanges(current, previous, 3);
  assert.equal(events.length, 1);
});

test("前回データが存在しない品目(新規収載等)はスキップする", () => {
  const previous: SyuyoItem[] = [];
  const current = [item({ itemCode: "99999", itemName: "新品目", pricePerKg: 500 })];
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 0);
});

test("価格が欠測(null)の品目はスキップする(0除算やNaN混入を避ける)", () => {
  const previous = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: 100 })];
  const current = [item({ itemCode: "30100", itemName: "だいこん", pricePerKg: null })];
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 0);
});

test("うち輸入の内訳行は変動検知の対象外", () => {
  const previous = [item({ itemCode: "36620", itemName: "うち輸入", pricePerKg: 100 })];
  const current = [item({ itemCode: "36620", itemName: "うち輸入", pricePerKg: 200, isBreakdownRow: true })];
  const events = detectPriceChanges(current, previous, 10);
  assert.equal(events.length, 0);
});
