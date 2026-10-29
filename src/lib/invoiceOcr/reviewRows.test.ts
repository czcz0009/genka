import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewReasons, reviewReasonLabel, priceChangePercent, confirmBlockers } from "./reviewRows.ts";

// 確認の画面で、行を「要確認」と「いつもどおり」に分ける決まり(設計の3段目、2026-10-28)。期待値はMahiroが確認する。
// 前回からの変化の基準は、アプリの仕入れ値アラートと同じ ±10%(ちょうど10%も要確認)。

const base = {
  isNew: false,
  needsConversion: false,
  lowConfidence: false,
  amountMismatch: false,
  computedFromAmount: false,
  previousPrice: 0.25 as number | null,
  newPrice: 0.25 as number | null,
};

test("Y-1 前回0.25円/g → 今回0.275円/g は +10% → 要確認", () => {
  assert.equal(priceChangePercent(0.25, 0.275), 10);
  assert.deepEqual(reviewReasons({ ...base, newPrice: 0.275 }), ["price_change"]);
});

test("Y-2 前回0.25円/g → 今回0.27円/g は +8% → いつもどおり(理由なし)", () => {
  assert.equal(priceChangePercent(0.25, 0.27), 8);
  assert.deepEqual(reviewReasons({ ...base, newPrice: 0.27 }), []);
});

test("Y-3 前回0.3円/g → 今回0.27円/g は −10%(計算機の誤差で −9.99…% にならないこと)→ 要確認", () => {
  assert.equal(priceChangePercent(0.3, 0.27), -10);
  assert.deepEqual(reviewReasons({ ...base, previousPrice: 0.3, newPrice: 0.27 }), ["price_change"]);
});

test("Y-4 新しい品目・換算がまだ・読み取りに自信なし・金額と合わない・金額から計算した・前回が未設定 → それぞれ要確認", () => {
  assert.deepEqual(reviewReasons({ ...base, isNew: true, previousPrice: null }), ["new_item"]);
  assert.deepEqual(reviewReasons({ ...base, needsConversion: true, newPrice: null }), ["needs_conversion"]);
  assert.deepEqual(reviewReasons({ ...base, lowConfidence: true }), ["low_confidence"]);
  assert.deepEqual(reviewReasons({ ...base, amountMismatch: true }), ["amount_mismatch"]);
  assert.deepEqual(reviewReasons({ ...base, computedFromAmount: true }), ["computed_from_amount"]);
  assert.deepEqual(reviewReasons({ ...base, previousPrice: null }), ["no_previous_price"]);
});

test("Y-5 理由が複数あれば全部、決まった順(新しい品目→換算→自信なし→金額→計算→前回なし→変化)で並べる", () => {
  assert.deepEqual(reviewReasons({ ...base, lowConfidence: true, computedFromAmount: true, newPrice: 0.3 }), [
    "low_confidence",
    "computed_from_amount",
    "price_change",
  ]);
});

test("Y-6 理由の書き方(画面にそのまま出す)", () => {
  assert.equal(reviewReasonLabel("new_item", {}), "新しい品目です");
  assert.equal(reviewReasonLabel("needs_conversion", { invoiceUnit: "個", ingredientUnit: "g" }), "1個が何gかを入れてください");
  assert.equal(reviewReasonLabel("low_confidence", { note: "数字がかすれている" }), "読み取りに自信がありません(数字がかすれている)");
  assert.equal(reviewReasonLabel("amount_mismatch", {}), "数量×単価が、金額と合いません。読み取りの誤りかもしれません");
  assert.equal(reviewReasonLabel("computed_from_amount", {}), "単価の記載が無いため、金額÷数量で計算しました");
  assert.equal(reviewReasonLabel("no_previous_price", {}), "前回の単価が未設定です");
  assert.equal(
    reviewReasonLabel("price_change", { previousPrice: 0.25, newPrice: 0.275, ingredientUnit: "g" }),
    "前回 0.25円/g → 今回 0.275円/g(+10%)",
  );
  assert.equal(
    reviewReasonLabel("price_change", { previousPrice: 200, newPrice: 180.8, ingredientUnit: "個" }),
    "前回 200円/個 → 今回 180.8円/個(−9.6%)",
  );
});

test("Y-7 確定できない理由: 納品書の税込・税抜を選んでいない/確定する行に換算がまだ・単価が空欄の行がある", () => {
  assert.deepEqual(confirmBlockers({ needsTaxChoice: true, rows: [] }), [
    "この納品書の金額が税込か税抜かを、上で選んでください",
  ]);
  assert.deepEqual(
    confirmBlockers({
      needsTaxChoice: false,
      rows: [
        { name: "玉ねぎ", included: true, needsConversion: true, priceBlank: false, conversionError: null },
        { name: "醤油", included: false, needsConversion: true, priceBlank: false, conversionError: null }, // 外した行は見ない
        { name: "キャベツ", included: true, needsConversion: false, priceBlank: true, conversionError: null },
        { name: "にんじん", included: true, needsConversion: false, priceBlank: false, conversionError: "換算は、0より大きい数で入れてください(例: 1個 = 200g なら 200)" },
      ],
    }),
    [
      "玉ねぎ: 換算を入れるか、この行を外してください",
      "キャベツ: 単価を入れるか、この行を外してください",
      "にんじん: 換算は、0より大きい数で入れてください(例: 1個 = 200g なら 200)",
    ],
  );
  assert.deepEqual(confirmBlockers({ needsTaxChoice: false, rows: [{ name: "玉ねぎ", included: true, needsConversion: false, priceBlank: false, conversionError: null }] }), []);
});

// 2026-10-29の指示: 別々の納品書が混ざったときのお知らせが出たら、「同じ納品書として確定する」に印を付けないと確定できない
// (お知らせを読み飛ばして、税込・税抜がずれた単価を保存するのを防ぐ)
test("Y-8 別々の納品書のお知らせが出ていて、印が無い → 確定できない。印があれば確定できる。お知らせが無ければ何も言わない", () => {
  const row = { name: "玉ねぎ", included: true, needsConversion: false, priceBlank: false, conversionError: null };
  assert.deepEqual(confirmBlockers({ needsTaxChoice: false, pagesMismatchUnconfirmed: true, rows: [row] }), [
    "選んだページの中に、別々の納品書かもしれないページがあります。上のお知らせを確かめて、同じ納品書なら「同じ納品書として確定する」に印を付けてください(別々の納品書なら、1枚ずつ読み取り直してください)",
  ]);
  assert.deepEqual(confirmBlockers({ needsTaxChoice: false, pagesMismatchUnconfirmed: false, rows: [row] }), []);
  assert.deepEqual(confirmBlockers({ needsTaxChoice: false, rows: [row] }), []);
  // 税込・税抜の選択と両方あれば、お知らせのほうを先に出す(どちらを選ぶかが変わりうるため)
  assert.deepEqual(confirmBlockers({ needsTaxChoice: true, pagesMismatchUnconfirmed: true, rows: [] }).length, 2);
  assert.match(confirmBlockers({ needsTaxChoice: true, pagesMismatchUnconfirmed: true, rows: [] })[0], /^選んだページの中に/);
});
