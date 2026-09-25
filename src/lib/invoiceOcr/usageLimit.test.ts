import { test } from "node:test";
import assert from "node:assert/strict";
import { OCR_ATTEMPT_LIMIT, OCR_USAGE_LIMIT, remainingOcrUses } from "./usageLimit.ts";

test("上限は3回", () => {
  assert.equal(OCR_USAGE_LIMIT, 3);
});

test("未使用なら3回残っている", () => {
  assert.equal(remainingOcrUses(0), 3);
});

test("2回使うと残り1回", () => {
  assert.equal(remainingOcrUses(2), 1);
});

test("3回使うと残り0回", () => {
  assert.equal(remainingOcrUses(3), 0);
});

test("上限を超えて記録されていても残りはマイナスにならない", () => {
  assert.equal(remainingOcrUses(5), 0);
});

test("試行回数の上限は成功回数の上限より大きい(10回)", () => {
  assert.equal(OCR_ATTEMPT_LIMIT, 10);
  assert.ok(OCR_ATTEMPT_LIMIT > OCR_USAGE_LIMIT);
});
