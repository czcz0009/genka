import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSyuyoCsv } from "./parseSyuyoCsv.ts";
import { matchIngredientsToItems } from "./matchIngredientToItem.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "26073h_syuyo.csv"));
const { items } = parseSyuyoCsv(fixtureBytes);

test("CSVの品目名と表記が完全一致する食材は高信頼度でマッチする", () => {
  const matches = matchIngredientsToItems([{ id: "i1", name: "だいこん" }], items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].itemCode, "30100");
  assert.equal(matches[0].confidence, "high");
  assert.equal(matches[0].method, "exact");
});

test("同義語辞書経由で、文字が一切重ならない言い換えもマッチする(じゃがいも⇔ばれいしょ)", () => {
  const matches = matchIngredientsToItems([{ id: "i1", name: "じゃがいも" }], items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].itemCode, "36200");
  assert.equal(matches[0].itemName, "ばれいしょ");
  assert.equal(matches[0].confidence, "high");
});

test("同義語辞書経由で「玉ねぎ」が「たまねぎ」にマッチする", () => {
  const matches = matchIngredientsToItems([{ id: "i1", name: "玉ねぎ" }], items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].itemCode, "36610");
});

test("末尾に注記がついた表記(「レタス(サニー)」)は前方一致でマッチする", () => {
  const matches = matchIngredientsToItems([{ id: "i1", name: "レタス(サニー)" }], items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].itemName, "レタス");
});

test("この調査に含まれない食材(青果物以外)はマッチしない", () => {
  const matches = matchIngredientsToItems(
    [
      { id: "i1", name: "醤油" },
      { id: "i2", name: "豚肉" },
      { id: "i3", name: "小麦粉" },
    ],
    items,
  );
  assert.equal(matches.length, 0);
});

test("「うち輸入」の内訳行はマッチ候補から除外される(親品目にだけマッチする)", () => {
  // たまねぎ・にんにく・しょうが等は「うち輸入」の内訳行を持つが、
  // 通常表記で登録した食材は常に親の品目行に一致し、内訳行が選ばれることはない
  const namesWithBreakdown = ["たまねぎ", "にんにく", "しょうが", "さやえんどう", "かぼちゃ"];
  const ingredients = namesWithBreakdown.map((name, i) => ({ id: `i${i}`, name }));
  const matches = matchIngredientsToItems(ingredients, items);
  const breakdownItemCodes = new Set(items.filter((i) => i.isBreakdownRow).map((i) => i.itemCode));
  assert.equal(matches.length, namesWithBreakdown.length);
  for (const m of matches) {
    assert.equal(breakdownItemCodes.has(m.itemCode), false);
  }
});

test("同義語辞書にない品目でも、表記がそれなりに近ければ低信頼度で候補になる", () => {
  // 「日本なし計」は辞書未登録だが、bigram類似度で「梨」に近い候補として拾われうる
  const matches = matchIngredientsToItems([{ id: "i1", name: "日本なし" }], items);
  if (matches.length > 0) {
    assert.equal(matches[0].confidence, "low");
    assert.equal(matches[0].method, "fuzzy");
  }
});
