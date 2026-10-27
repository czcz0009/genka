import { test } from "node:test";
import assert from "node:assert/strict";
import { unitMismatchNote } from "./unitNote.ts";

// 単位が違い、自動で換算できないときの案内(2026-10-27、設計の1段目のつなぎ)。計算の例を必ず添える。
test("N-1 玉ねぎ(納品書は個、登録済みはg)の案内に、計算の例(55÷200=0.275円/g)が入る", () => {
  assert.equal(
    unitMismatchNote("個", "g"),
    "納品書の単位は「個」、登録済みの単位は「g」です。下の「単価」の欄に、gあたりの単価を計算して入れてください(例: 玉ねぎ1個55円で、1個が200gなら、55÷200=0.275円/g)。1個が何gかを覚えて自動で計算する仕組みは、次の更新で入れます。",
  );
});
test("N-2 例の計算そのものが正しい(55÷200=0.275)", () => {
  assert.equal(55 / 200, 0.275);
});
