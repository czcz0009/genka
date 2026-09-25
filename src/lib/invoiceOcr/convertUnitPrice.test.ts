import { test } from "node:test";
import assert from "node:assert/strict";
import { convertUnitPrice, isSameUnit } from "./convertUnitPrice.ts";

test("同じ単位ならそのまま", () => {
  assert.equal(convertUnitPrice(1200, "kg", "kg"), 1200);
});

test("kg単価 → g単価: 1,200円/kg は 1.2円/g", () => {
  assert.equal(convertUnitPrice(1200, "kg", "g"), 1.2);
});

test("g単価 → kg単価: 1.5円/g は 1,500円/kg", () => {
  assert.equal(convertUnitPrice(1.5, "g", "kg"), 1500);
});

test("L単価 → ml単価: 800円/L は 0.8円/ml", () => {
  assert.equal(convertUnitPrice(800, "L", "ml"), 0.8);
});

test("ml単価 → L単価: 0.5円/ml は 500円/L", () => {
  assert.equal(convertUnitPrice(0.5, "ml", "L"), 500);
});

test("表記ゆれ(全角・大文字・日本語)でも換算できる", () => {
  assert.equal(convertUnitPrice(1200, "ＫＧ", "g"), 1.2);
  assert.equal(convertUnitPrice(1200, "キロ", "グラム"), 1.2);
  assert.equal(convertUnitPrice(800, "リットル", "ml"), 0.8);
});

test("換算できない組み合わせは null(個↔kg、重さ↔容量)", () => {
  assert.equal(convertUnitPrice(150, "個", "kg"), null);
  assert.equal(convertUnitPrice(1200, "kg", "ml"), null);
  assert.equal(convertUnitPrice(980, "本", "個"), null);
});

test("isSameUnit: 表記ゆれを同じ単位とみなす", () => {
  assert.equal(isSameUnit("KG", "kg"), true);
  assert.equal(isSameUnit("個", "kg"), false);
});

test("OCRが変な文字列(toString等)を返しても NaN にならず null", () => {
  assert.equal(convertUnitPrice(100, "toString", "valueOf"), null);
  assert.equal(convertUnitPrice(100, "constructor", "g"), null);
  assert.equal(convertUnitPrice(100, "__proto__", "kg"), null);
});
