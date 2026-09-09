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

test("食材名から畜種(豚/牛/鶏)を判定できても、候補は同じ畜種の規格だけに絞られる(他畜種は混ざらない)", () => {
  const suggestions = suggestChikusanItems("牛肉ロース");
  assert.equal(suggestions.length, 5); // 牛関連の規格数(wagyu_a5/a4, cross_b3, dairy_b2, mature_cattle_m)のみ
  for (const s of suggestions) {
    assert.ok(["wagyu_a5", "wagyu_a4", "cross_b3", "dairy_b2", "mature_cattle_m"].includes(s.itemCode));
  }
  for (let i = 1; i < suggestions.length; i++) {
    assert.ok(suggestions[i - 1].score >= suggestions[i].score);
  }
});

test("豚の食材には豚の規格だけが候補になり、牛・鶏の規格は混ざらない", () => {
  const suggestions = suggestChikusanItems("豚バラ肉");
  assert.ok(suggestions.length > 0);
  for (const s of suggestions) {
    assert.equal(s.itemCode, "pork_tokyo");
  }
});

test("野菜など畜産物と無関係な食材には候補を一切返さない(規格選択UIを出さないための判定に使う)", () => {
  assert.equal(suggestChikusanItems("キャベツ").length, 0);
  assert.equal(suggestChikusanItems("じゃがいも").length, 0);
  assert.equal(suggestChikusanItems("醤油").length, 0);
});

test("「鶏卵」「牛乳」のように畜種を表す漢字を含むが肉ではない食材は対象外にする", () => {
  assert.equal(suggestChikusanItems("鶏卵").length, 0);
  assert.equal(suggestChikusanItems("牛乳").length, 0);
});
