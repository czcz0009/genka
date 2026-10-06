import { test } from "node:test";
import assert from "node:assert/strict";
import { initialDirectPriceInput, resolveEditedPrice, isPriceChanged } from "./ingredientEditPrice.ts";

/**
 * 食材の編集画面を「単価を直接入力する」で開く件(検算済みのテストケース(a)〜(f))。
 *
 * 条件:
 * - 未設定の食材は単価欄を空にして開く(「0」を入れない)。保存しても未設定のまま
 * - 単価は丸めずに、保存されている値のままを入れる(表示用の小数第2位の丸めを使わない)
 * - 単価(と設定済みかどうか)が変わっていなければ、価格履歴を増やさない
 *
 * 単価の列(ingredients.current_purchase_price・ingredient_price_history.price)は
 * 桁数指定の無いnumericで、渡された値を丸めずに保存する。DBから読み戻した値は
 * JavaScriptの数値になり、それを文字列にして入力欄に入れ、保存時に数値へ戻す。
 * この往復で値が変わらないことを下で確かめる(変わると「変わった」と誤判定し、履歴が増えてしまう)。
 */

test("(a) 設定済みで割り切れない単価(1,000円÷6,000g): 入力欄には丸めずにそのまま入り、カテゴリだけ変えて保存しても単価・状態は変わらず、履歴は増えない", () => {
  const stored = 1000 / 6000; // 0.16666666666666666
  const input = initialDirectPriceInput({ priceIsSet: true, currentPurchasePrice: stored });
  assert.equal(input, "0.16666666666666666");
  const saved = resolveEditedPrice({ wasSet: true, currentPurchasePrice: stored, directInput: input });
  assert.deepEqual(saved, { ok: true, purchasePrice: stored, priceIsSet: true });
  assert.equal(isPriceChanged({ price: stored, isSet: true }, { price: stored, isSet: true }), false);
});

test("(a) 文字列⇔数値の往復で値が変わらない(割り切れない値・2進数で表せない値・とても小さい値・大きい値)", () => {
  for (const stored of [1 / 6, 1 / 3, 2 / 7, 0.1 + 0.2, 0.7, 123.456, 1e-7, 1234567.891, 0]) {
    const input = initialDirectPriceInput({ priceIsSet: true, currentPurchasePrice: stored });
    const saved = resolveEditedPrice({ wasSet: true, currentPurchasePrice: stored, directInput: input });
    assert.ok(saved.ok);
    if (!saved.ok) continue;
    assert.equal(saved.purchasePrice, stored, `${stored} → "${input}" → ${saved.purchasePrice}`);
    assert.equal(isPriceChanged({ price: stored, isSet: true }, { price: saved.purchasePrice, isSet: saved.priceIsSet }), false);
  }
});

test("(b) 未設定の食材: 入力欄は空(「0」を入れない)。カテゴリだけ変えて保存しても未設定のままで、履歴は増えない", () => {
  const input = initialDirectPriceInput({ priceIsSet: false, currentPurchasePrice: 0 });
  assert.equal(input, "");
  const saved = resolveEditedPrice({ wasSet: false, currentPurchasePrice: 0, directInput: input });
  assert.deepEqual(saved, { ok: true, purchasePrice: 0, priceIsSet: false });
  assert.equal(isPriceChanged({ price: 0, isSet: false }, { price: 0, isSet: false }), false);
});

test("(c) 0円と明示して設定済みの食材: 入力欄は「0」。カテゴリだけ変えて保存しても設定済みのままで、履歴は増えない", () => {
  const input = initialDirectPriceInput({ priceIsSet: true, currentPurchasePrice: 0 });
  assert.equal(input, "0");
  const saved = resolveEditedPrice({ wasSet: true, currentPurchasePrice: 0, directInput: input });
  assert.deepEqual(saved, { ok: true, purchasePrice: 0, priceIsSet: true });
  assert.equal(isPriceChanged({ price: 0, isSet: true }, { price: 0, isSet: true }), false);
});

test("(d) 設定済みの食材の単価を1.5→1.8に変更: 変わったと判定し、履歴が1件増える", () => {
  const saved = resolveEditedPrice({ wasSet: true, currentPurchasePrice: 1.5, directInput: "1.8" });
  assert.deepEqual(saved, { ok: true, purchasePrice: 1.8, priceIsSet: true });
  assert.equal(isPriceChanged({ price: 1.5, isSet: true }, { price: 1.8, isSet: true }), true);
});

test("(e) 設定済みの食材の単価欄を空にして保存: 保存せず「仕入単価を入力してください」(設定済みから未設定には戻せない)", () => {
  const saved = resolveEditedPrice({ wasSet: true, currentPurchasePrice: 1.5, directInput: "  " });
  assert.deepEqual(saved, { ok: false, error: "仕入単価を入力してください" });
});

test("(f) 未設定の食材の単価欄に「0」を入れて保存: 設定済みの0円として保存され、履歴が1件増える", () => {
  const saved = resolveEditedPrice({ wasSet: false, currentPurchasePrice: 0, directInput: "0" });
  assert.deepEqual(saved, { ok: true, purchasePrice: 0, priceIsSet: true });
  assert.equal(isPriceChanged({ price: 0, isSet: false }, { price: 0, isSet: true }), true);
});

test("マイナス・数値でない入力は保存しない", () => {
  assert.deepEqual(resolveEditedPrice({ wasSet: true, currentPurchasePrice: 1, directInput: "-1" }), {
    ok: false,
    error: "仕入単価は0以上の数値で入力してください",
  });
  assert.deepEqual(resolveEditedPrice({ wasSet: false, currentPurchasePrice: 0, directInput: "abc" }), {
    ok: false,
    error: "仕入単価は0以上の数値で入力してください",
  });
});
