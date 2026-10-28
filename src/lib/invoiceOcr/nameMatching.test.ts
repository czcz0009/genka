import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIngredientName, matchIngredient, aliasToSave } from "./nameMatching.ts";

// 名前の対応づけを覚える(設計の4段目、2026-10-28)。期待値N-1〜N-8はMahiroが確認する。
// 納品書の表記(玉葱・タマネギ等)を、登録済みの食材に結びつける。店主が一度選んだ対応は覚えて、次から自動で選ぶ。

const ingredients = [
  { id: "onion", name: "たまねぎ" },
  { id: "cabbage", name: "キャベツ" },
  { id: "pork", name: "豚こま肉" },
  { id: "carrot", name: "人参" },
];

test("N-1 名前のそろえ方: カタカナはひらがなに、全角半角・空白・括弧・区切りの記号もそろえる", () => {
  assert.equal(normalizeIngredientName("タマネギ"), "たまねぎ");
  assert.equal(normalizeIngredientName("玉ネギ"), "玉ねぎ");
  assert.equal(normalizeIngredientName("ｷｬﾍﾞﾂ"), "きゃべつ");
  assert.equal(normalizeIngredientName("豚こま 肉(国産)"), "豚こま肉国産");
  assert.equal(normalizeIngredientName("ミニトマト・赤"), "みにとまと赤"); // 伸ばす棒「ー」はそのまま(この例には無い)
  assert.equal(normalizeIngredientName("ピーマン"), "ぴーまん");
});

test("N-2 そろえた名前が登録済みの食材と同じ → 自動で選ぶ(名前で一致)", () => {
  assert.deepEqual(matchIngredient("タマネギ", ingredients, []), { kind: "name", ingredientId: "onion" });
  assert.deepEqual(matchIngredient("ｷｬﾍﾞﾂ", ingredients, []), { kind: "name", ingredientId: "cabbage" });
});

test("N-3 覚えた対応(玉葱 → たまねぎ)があれば、自動で選ぶ(覚えた対応で一致)。覚える前は、自動では選ばず、野菜の同義語の辞書から候補に「たまねぎ」を出す", () => {
  assert.deepEqual(matchIngredient("玉葱", ingredients, []), { kind: "candidates", ingredientIds: ["onion"] });
  const aliases = [{ ingredientId: "onion", normalizedAlias: normalizeIngredientName("玉葱") }];
  assert.deepEqual(matchIngredient("玉葱", ingredients, aliases), { kind: "alias", ingredientId: "onion" });
});

test("N-4 似ている名前(玉ネギ と たまねぎ、北海道産玉ねぎL と たまねぎ)は、候補として出すだけ(自動では選ばない)", () => {
  assert.deepEqual(matchIngredient("玉ネギ", ingredients, []), { kind: "candidates", ingredientIds: ["onion"] });
  assert.deepEqual(matchIngredient("北海道産たまねぎL", ingredients, []), { kind: "candidates", ingredientIds: ["onion"] });
  assert.deepEqual(matchIngredient("ズッキーニ", ingredients, []), { kind: "none" }); // 似た名前も辞書の仲間も無い
});

// 2026-10-28の指示: 市場価格の照合で使っている野菜の同義語の辞書(marketPrices/itemAliases.ts)で、候補を出す(自動では選ばない)
test("N-9 同義語の辞書: 「にんじん」(登録名が「人参」)→ 候補に「人参」。「馬鈴薯」(登録名が「じゃがいも」)→ 候補に「じゃがいも」", () => {
  assert.deepEqual(matchIngredient("にんじん", ingredients, []), { kind: "candidates", ingredientIds: ["carrot"] });
  assert.deepEqual(matchIngredient("馬鈴薯", [{ id: "potato", name: "じゃがいも" }], []), { kind: "candidates", ingredientIds: ["potato"] });
});

test("N-10 辞書の候補と似た名前の候補が両方あれば、辞書の候補を先に出す。同じ食材は1回だけ", () => {
  const list = [{ id: "negi", name: "長ねぎ" }, { id: "tamanegi", name: "玉ねぎ" }];
  // 「白ねぎ」: 辞書では「長ねぎ」の仲間。「玉ねぎ」は文字が似ているだけ
  assert.deepEqual(matchIngredient("白ねぎ", list, []), { kind: "candidates", ingredientIds: ["negi", "tamanegi"] });
});

test("N-5 名前の一致は、覚えた対応より優先する(覚えた対応が別の食材を指していても)", () => {
  const aliases = [{ ingredientId: "pork", normalizedAlias: "きゃべつ" }];
  assert.deepEqual(matchIngredient("キャベツ", ingredients, aliases), { kind: "name", ingredientId: "cabbage" });
});

test("N-6 覚えた対応の食材が、もう無い(消した)→ その対応は使わない", () => {
  const aliases = [{ ingredientId: "deleted", normalizedAlias: normalizeIngredientName("玉葱") }];
  assert.deepEqual(matchIngredient("玉葱", ingredients, aliases), { kind: "candidates", ingredientIds: ["onion"] }); // 辞書の候補には出る(自動では選ばない)
});

test("N-7 覚える対応: 店主が選び直した行で、「この名前を覚える」に印があり、確定できたときだけ", () => {
  const base = { invoiceName: "玉葱", chosen: { id: "onion", name: "たまねぎ" }, autoMatched: false, remember: true, rowSaved: true };
  assert.deepEqual(aliasToSave(base), { ingredient_id: "onion", alias: "玉葱", normalized_alias: "玉葱" });
  assert.equal(aliasToSave({ ...base, remember: false }), null);
  assert.equal(aliasToSave({ ...base, rowSaved: false }), null);
  assert.equal(aliasToSave({ ...base, autoMatched: true }), null); // 自動で選んだまま → 覚え直す必要なし
  assert.equal(aliasToSave({ ...base, invoiceName: "タマネギ" }), null); // そろえると食材の名前と同じ → 覚える必要なし
  assert.equal(aliasToSave({ ...base, chosen: null }), null); // 新しい食材として登録 → 名前そのものが登録される
});

test("N-8 長すぎる表記(100文字を超える)は覚えない", () => {
  assert.equal(aliasToSave({ invoiceName: "あ".repeat(101), chosen: { id: "onion", name: "たまねぎ" }, autoMatched: false, remember: true, rowSaved: true }), null);
});
