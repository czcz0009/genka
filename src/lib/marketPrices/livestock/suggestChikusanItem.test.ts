import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestChikusanItems } from "./suggestChikusanItem.ts";

test("「鶏もも肉」は鶏肉ももが最有力候補になる", () => {
  const suggestions = suggestChikusanItems("鶏もも肉");
  assert.equal(suggestions[0].itemCode, "chicken_thigh");
});

test("「和牛A5」は wagyu_a5 が最有力候補になる", () => {
  const suggestions = suggestChikusanItems("和牛A5");
  assert.equal(suggestions[0].itemCode, "wagyu_a5");
});

test("曖昧な「豚肉」でも候補は返す(が、これはあくまで初期選択肢の提案であり自動確定はしない)", () => {
  const suggestions = suggestChikusanItems("豚肉");
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].itemCode, "pork_tokyo");
});

test("この調査に対応しない食材(例:牛肉ロース)でも例外にせず、候補一覧をスコア順に返す", () => {
  const suggestions = suggestChikusanItems("牛肉ロース");
  assert.equal(suggestions.length, 8); // 全規格分、スコア順
  for (let i = 1; i < suggestions.length; i++) {
    assert.ok(suggestions[i - 1].score >= suggestions[i].score);
  }
});
