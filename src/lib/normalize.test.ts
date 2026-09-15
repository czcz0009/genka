import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForDedupe, normalizeDisplayName, validateNameLength, MAX_NAME_LENGTH } from "./normalize.ts";

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

test("validateNameLength: 上限文字数以内ならnull(問題なし)", () => {
  assert.equal(validateNameLength("小麦粉", "食材名"), null);
  assert.equal(validateNameLength("あ".repeat(MAX_NAME_LENGTH), "食材名"), null);
});

test("validateNameLength: 上限を1文字でも超えたらエラーメッセージを返す", () => {
  const error = validateNameLength("あ".repeat(MAX_NAME_LENGTH + 1), "食材名");
  assert.equal(error, `食材名は${MAX_NAME_LENGTH}文字以内で入力してください`);
});
