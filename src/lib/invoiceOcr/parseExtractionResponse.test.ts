import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtractionResponse } from "./parseExtractionResponse.ts";

test("parseExtractionResponse: 正常なJSON配列を読み取れる", () => {
  const raw = JSON.stringify([
    { name: "豚肉", quantity: 1000, unit: "g", unitPrice: 2.5, totalAmount: 2500, lowConfidence: false, note: null },
    { name: "玉ねぎ", quantity: 5, unit: "kg", unitPrice: null, totalAmount: 1000, lowConfidence: true, note: "数字が薄くて判読しづらい" },
  ]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "豚肉");
  assert.equal(result.items[0].unitPrice, 2.5);
  assert.equal(result.items[1].lowConfidence, true);
  assert.equal(result.items[1].note, "数字が薄くて判読しづらい");
});

test("parseExtractionResponse: Markdownのコードフェンスで囲まれていても読み取れる", () => {
  const raw = "```json\n" + JSON.stringify([{ name: "醤油", quantity: 1, unit: "本" }]) + "\n```";
  const result = parseExtractionResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "醤油");
});

test("parseExtractionResponse: JSONとして解析できない応答はエラーを返す", () => {
  const result = parseExtractionResponse("すみません、この画像は読み取れませんでした。");
  assert.equal(result.items.length, 0);
  assert.ok(result.error);
});

test("parseExtractionResponse: 食材名が無い行だけ読み飛ばし、他は候補に残す", () => {
  const raw = JSON.stringify([{ name: "" }, { name: "味噌", quantity: 1, unit: "kg" }]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "味噌");
});

test("parseExtractionResponse: 数値が文字列(カンマ・円マーク付き)で来ても数値に変換する", () => {
  const raw = JSON.stringify([{ name: "米", quantity: "10", unit: "kg", unitPrice: "¥350", totalAmount: "3,500" }]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.items[0].quantity, 10);
  assert.equal(result.items[0].unitPrice, 350);
  assert.equal(result.items[0].totalAmount, 3500);
});
