import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumericJa, numericFraction } from "./numeric.ts";

test("全角数字を数値に変換できる", () => {
  assert.equal(parseNumericJa("１５０"), 150);
});

test("桁区切りカンマ付きの数値を変換できる", () => {
  assert.equal(parseNumericJa("1,500"), 1500);
});

test("全角カンマ+全角数字の組み合わせも変換できる", () => {
  assert.equal(parseNumericJa("１，５００"), 1500);
});

test("円記号・カンマ・小数を組み合わせた表記を変換できる", () => {
  assert.equal(parseNumericJa("¥1,234.5"), 1234.5);
});

test("パーセント表記を数値として変換できる(記号は除去するだけで割り算はしない)", () => {
  assert.equal(parseNumericJa("12.5%"), 12.5);
});

test("空文字・空白のみはnullを返す", () => {
  assert.equal(parseNumericJa(""), null);
  assert.equal(parseNumericJa("   "), null);
  assert.equal(parseNumericJa(null), null);
  assert.equal(parseNumericJa(undefined), null);
});

test("数値として読めない文字列はnullを返す", () => {
  assert.equal(parseNumericJa("たくさん"), null);
  assert.equal(parseNumericJa("約100g"), null); // 単位が混ざっているものは非対応(要手動修正)
});

test("numericFraction: 空欄は分母・分子どちらからも除外する", () => {
  // 6行中、空欄2行を除いた4行のうち3行が数値 -> 3/4
  assert.equal(numericFraction(["100", "200", "", "abc", "  ", "300"]), 0.75);
});

test("numericFraction: 全て空欄なら0を返す", () => {
  assert.equal(numericFraction(["", "  ", ""]), 0);
});
