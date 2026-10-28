import { test } from "node:test";
import assert from "node:assert/strict";
import { initialConversionState, editConversionValue, confirmEstimate, conversionToSave } from "./conversionMemory.ts";

// 換算を覚える(保存する)かどうかの決まり(2026-10-28)。期待値M-1〜M-7はMahiroが確認する。
// 換算の表の source: 'owner' = 店主が入れた(直した)値 / 'estimate' = 目安の値を、店主がそのまま確定したもの。
// 店主が確かめていない目安は、表に保存しない。

const onion = { ingredientName: "玉ねぎ", purchaseUnit: "個", ingredientUnit: "g" };
const saveArgs = { included: true, rowSaved: true, ingredientId: "ing-1", purchaseUnit: "個" };

test("M-1 覚えた換算があれば、それを最初の値にする(source: remembered)。目安より優先", () => {
  const s = initialConversionState({ ...onion, remembered: { amount: 210, unit: "g" } });
  assert.deepEqual(s, { value: "210", unit: "g", source: "remembered", estimateConfirmed: false, remember: true });
});

test("M-2 覚えた換算が無く、目安があれば、目安を最初の値にする(まだ確かめていない)", () => {
  const s = initialConversionState({ ...onion, remembered: null });
  assert.deepEqual(s, { value: "200", unit: "g", source: "estimate", estimateConfirmed: false, remember: true });
});

test("M-3 どちらも無ければ空欄(店主が入れる)。換算が要らない行(同じ単位・kg→g)は null", () => {
  assert.deepEqual(initialConversionState({ ingredientName: "春菊", purchaseUnit: "束", ingredientUnit: "g", remembered: null }), {
    value: "",
    unit: "g",
    source: "owner",
    estimateConfirmed: false,
    remember: true,
  });
  assert.equal(initialConversionState({ ingredientName: "キャベツ", purchaseUnit: "個", ingredientUnit: "個", remembered: null }), null);
  assert.equal(initialConversionState({ ingredientName: "豚こま", purchaseUnit: "kg", ingredientUnit: "g", remembered: null }), null);
});

test("M-4 ★確かめていない目安は保存しない。「この値で正しい」に印を付けたら source: estimate で保存する", () => {
  const s = initialConversionState({ ...onion, remembered: null })!;
  assert.equal(conversionToSave({ ...saveArgs, conversion: s }), null);
  assert.deepEqual(conversionToSave({ ...saveArgs, conversion: confirmEstimate(s) }), {
    ingredient_id: "ing-1",
    purchase_unit: "個",
    amount: 200,
    amount_unit: "g",
    source: "estimate",
  });
});

test("M-5 目安の値を店主が直したら、店主の値(source: owner)。印が無くても保存する", () => {
  const s = editConversionValue(initialConversionState({ ...onion, remembered: null })!, "180");
  assert.equal(s.source, "owner");
  assert.deepEqual(conversionToSave({ ...saveArgs, conversion: s }), {
    ingredient_id: "ing-1",
    purchase_unit: "個",
    amount: 180,
    amount_unit: "g",
    source: "owner",
  });
});

test("M-6 保存しない場合: 行を外した/行の保存に失敗した/「換算を覚える」を外した/値がだめ/覚えた値のまま(書き直し不要)", () => {
  const owner = editConversionValue(initialConversionState({ ...onion, remembered: null })!, "180");
  assert.equal(conversionToSave({ ...saveArgs, included: false, conversion: owner }), null);
  assert.equal(conversionToSave({ ...saveArgs, rowSaved: false, conversion: owner }), null);
  assert.equal(conversionToSave({ ...saveArgs, conversion: { ...owner, remember: false } }), null);
  assert.equal(conversionToSave({ ...saveArgs, conversion: editConversionValue(owner, "0") }), null);
  assert.equal(conversionToSave({ ...saveArgs, conversion: initialConversionState({ ...onion, remembered: { amount: 210, unit: "g" } }) }), null);
});

test("M-7 覚えた値を直したら、店主の値として上書きする(210 → 220)", () => {
  const s = editConversionValue(initialConversionState({ ...onion, remembered: { amount: 210, unit: "g" } })!, "220");
  assert.deepEqual(conversionToSave({ ...saveArgs, conversion: s }), {
    ingredient_id: "ing-1",
    purchase_unit: "個",
    amount: 220,
    amount_unit: "g",
    source: "owner",
  });
});
