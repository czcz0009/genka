import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForDedupe, normalizeDisplayName } from "./normalize.ts";

test("normalizeForDedupe: 前後の空白・全角空白の違いを同一視する", () => {
  assert.equal(normalizeForDedupe("小麦粉"), normalizeForDedupe(" 小麦粉　"));
});

test("normalizeForDedupe: 全角/半角の違いを同一視する", () => {
  assert.equal(normalizeForDedupe("ＡＢＣ牛乳"), normalizeForDedupe("ABC牛乳"));
});

test("normalizeForDedupe: 大文字/小文字の違いを同一視する", () => {
  assert.equal(normalizeForDedupe("Milk"), normalizeForDedupe("milk"));
});

test("normalizeForDedupe: 括弧内の注記まで一致しない限り別物として扱う(過剰マージしない)", () => {
  assert.notEqual(normalizeForDedupe("小麦粉(強力粉)"), normalizeForDedupe("小麦粉(薄力粉)"));
});

test("normalizeDisplayName: 表示名は入力をほぼ保持しつつ空白だけ正規化する", () => {
  assert.equal(normalizeDisplayName("　小麦粉  "), "小麦粉");
});
