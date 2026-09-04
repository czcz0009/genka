import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotPublishedStatus } from "./fetchSyuyoCsv.ts";

// 実際に確認した挙動: 未公表期間へのアクセスは404ではなく403で返ってくる。
// どちらも「まだ公表されていないだけ」として扱い、エラーで落とさない。
test("isNotPublishedStatus: 404は未公表として扱う", () => {
  assert.equal(isNotPublishedStatus(404), true);
});

test("isNotPublishedStatus: 403も未公表として扱う(実際に観測された挙動)", () => {
  assert.equal(isNotPublishedStatus(403), true);
});

test("isNotPublishedStatus: 200/500系は未公表扱いにしない", () => {
  assert.equal(isNotPublishedStatus(200), false);
  assert.equal(isNotPublishedStatus(500), false);
  assert.equal(isNotPublishedStatus(503), false);
});
