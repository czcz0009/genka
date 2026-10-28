import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateConversion, CONVERSION_ESTIMATES } from "./conversionEstimates.ts";

// 換算の目安(玉ねぎ1個 約200g など)。DBには入れず、確認の画面で「目安」として最初の値に入れるだけ。店主が確かめて確定した値だけ覚える。
// 目安の値の一覧(CONVERSION_ESTIMATES)と、E-1〜E-6の期待値はMahiroが確認する。

test("E-1 玉ねぎ・個・食材の単位 g → 目安 200g", () => {
  assert.deepEqual(estimateConversion("玉ねぎ", "個", "g"), { amount: 200, unit: "g" });
});

test("E-2 呼び方のゆれ(たまねぎ・タマネギ・玉葱)も同じ目安", () => {
  for (const name of ["たまねぎ", "タマネギ", "玉葱", " 玉ねぎ "]) assert.deepEqual(estimateConversion(name, "個", "g"), { amount: 200, unit: "g" });
});

test("E-3 食材の単位が kg → 目安を kg で(玉ねぎ1個 = 0.2kg)", () => {
  assert.deepEqual(estimateConversion("玉ねぎ", "個", "kg"), { amount: 0.2, unit: "kg" });
});

test("E-4 一覧に無い単位(玉ねぎの 箱)・一覧に無い品目・食材の単位が重さでない → 目安なし(空欄で聞く)", () => {
  assert.equal(estimateConversion("玉ねぎ", "箱", "g"), null);
  assert.equal(estimateConversion("春菊", "束", "g"), null);
  assert.equal(estimateConversion("玉ねぎ", "個", "個"), null);
  assert.equal(estimateConversion("玉ねぎ", "個", "ml"), null);
});

test("E-5 キャベツは 玉 でも 個 でも 1,200g", () => {
  assert.deepEqual(estimateConversion("キャベツ", "玉", "g"), { amount: 1200, unit: "g" });
  assert.deepEqual(estimateConversion("キャベツ", "個", "g"), { amount: 1200, unit: "g" });
});

test("E-6 目安の一覧(Mahiroが値を確認する)", () => {
  assert.deepEqual(
    CONVERSION_ESTIMATES.map((e) => `${e.names[0]} 1${e.units.join("・")} = ${e.grams}g`),
    [
      "玉ねぎ 1個 = 200g",
      "にんじん 1本 = 150g",
      "じゃがいも 1個 = 150g",
      "キャベツ 1玉・個 = 1200g",
      "白菜 1株・個 = 2000g",
      "大根 1本 = 1000g",
      "トマト 1個 = 150g",
      "きゅうり 1本 = 100g",
      "なす 1本 = 80g",
      "ピーマン 1個 = 35g",
      "長ねぎ 1本 = 100g",
      "レタス 1玉・個 = 300g",
      "ブロッコリー 1株・個 = 250g",
      "レモン 1個 = 100g",
    ],
  );
});
