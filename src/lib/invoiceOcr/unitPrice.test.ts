import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundUnitPrice,
  lineUnitPrice,
  adjustForTax,
  conversionToIngredientUnit,
  validateConversionInput,
  resolveIngredientUnitPrice,
  computeRowPrice,
} from "./unitPrice.ts";

// 納品書の単価を、食材の単位・店の税の設定にそろえる計算(設計の2・3段目、2026-10-28)。
// 期待値はMahiroが検算する。単価は小数第4位まで(第5位を四捨五入)で持つ。

// ---------- 換算(K) ----------

test("K-1 玉ねぎ 55円/個、食材の単位 g、1個 = 200g → 0.275円/g", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 55, invoiceUnit: "個", ingredientUnit: "g", conversion: { amount: 200, unit: "g" } }), {
    kind: "converted",
    price: 0.275,
  });
});

test("K-2 にんじん 65円/本、1本 = 150g → 0.4333円/g(65÷150 = 0.43333…)", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 65, invoiceUnit: "本", ingredientUnit: "g", conversion: { amount: 150, unit: "g" } }), {
    kind: "converted",
    price: 0.4333,
  });
});

test("K-3 キャベツ 180円/個、食材の単位も 個 → 180円/個(換算しない)", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 180, invoiceUnit: "個", ingredientUnit: "個", conversion: null }), { kind: "same", price: 180 });
});

test("K-4・K-5 豚こま 1,500円/kg → 1.5円/g、牛乳 250円/L → 0.25円/ml(重さ同士・容量同士は聞かずに換算)", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 1500, invoiceUnit: "kg", ingredientUnit: "g", conversion: null }), { kind: "auto", price: 1.5 });
  assert.deepEqual(resolveIngredientUnitPrice({ price: 250, invoiceUnit: "L", ingredientUnit: "ml", conversion: null }), { kind: "auto", price: 0.25 });
});

test("K-6 じゃがいも 1箱 2,000円、1箱 = 10kg、食材の単位 g → 0.2円/g(箱→kg→g と続けて換算)", () => {
  assert.equal(conversionToIngredientUnit({ amount: 10, unit: "kg" }, "g"), 10000);
  assert.deepEqual(resolveIngredientUnitPrice({ price: 2000, invoiceUnit: "箱", ingredientUnit: "g", conversion: { amount: 10, unit: "kg" } }), {
    kind: "converted",
    price: 0.2,
  });
});

test("K-7 醤油 300円/L、食材の単位 g、換算なし → 自動では換算しない(容量と重さは別。1Lが何gかを聞く)", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 300, invoiceUnit: "L", ingredientUnit: "g", conversion: null }), {
    kind: "needs_conversion",
    price: null,
  });
});

test("K-8 玉ねぎ 55円/個、食材の単位 g、換算がまだ → 換算を聞く(10/27にMahiroが詰まった場面)", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 55, invoiceUnit: "個", ingredientUnit: "g", conversion: null }), {
    kind: "needs_conversion",
    price: null,
  });
});

test("K-9 換算の入力が 0・マイナス・空欄・数字でない → その行に理由を出して確定できない", () => {
  const msg = "換算は、0より大きい数で入れてください(例: 1個 = 200g なら 200)";
  assert.equal(validateConversionInput("0"), msg);
  assert.equal(validateConversionInput("-5"), msg);
  assert.equal(validateConversionInput(""), msg);
  assert.equal(validateConversionInput("約200"), msg);
  assert.equal(validateConversionInput("1000001"), "換算は、1,000,000以下の数で入れてください");
  assert.equal(validateConversionInput("200"), null);
  assert.equal(validateConversionInput(" 0.5 "), null);
  assert.equal(validateConversionInput("２００"), null); // 全角の数字も受け付ける
});

test("K-10 換算の単位が、食材の単位と別の種類(食材は g なのに 1個 = 2L)なら使えない", () => {
  assert.equal(conversionToIngredientUnit({ amount: 2, unit: "L" }, "g"), null);
  assert.deepEqual(resolveIngredientUnitPrice({ price: 55, invoiceUnit: "個", ingredientUnit: "g", conversion: { amount: 2, unit: "L" } }), {
    kind: "needs_conversion",
    price: null,
  });
});

test("K-11 食材の単位が 個 で、納品書が kg(1kg = 5個 と覚えている)→ 1kg 600円は 120円/個", () => {
  assert.deepEqual(resolveIngredientUnitPrice({ price: 600, invoiceUnit: "kg", ingredientUnit: "個", conversion: { amount: 5, unit: "個" } }), {
    kind: "converted",
    price: 120,
  });
});

test("K-12 単価は小数第4位まで(第5位を四捨五入)", () => {
  assert.equal(roundUnitPrice(0.123456), 0.1235);
  assert.equal(roundUnitPrice(0.29700000000000004), 0.297);
  assert.equal(roundUnitPrice(59.4), 59.4);
  assert.equal(roundUnitPrice(180), 180);
});

// ---------- 金額と数量からの単価(L) ----------

test("L-1 数量10・単価180・金額1,900(10×180 = 1,800 と合わない)→ 単価は180のまま、合わない印を付ける", () => {
  assert.deepEqual(lineUnitPrice({ quantity: 10, unitPrice: 180, totalAmount: 1900 }), { price: 180, computedFromAmount: false, amountMismatch: true });
});

test("L-2 単価の記載が無く、数量10・金額1,800 → 単価180を計算して入れる(計算した印を付ける)", () => {
  assert.deepEqual(lineUnitPrice({ quantity: 10, unitPrice: null, totalAmount: 1800 }), { price: 180, computedFromAmount: true, amountMismatch: false });
});

test("L-3 数量10・単価180・金額1,800 → 合っている", () => {
  assert.deepEqual(lineUnitPrice({ quantity: 10, unitPrice: 180, totalAmount: 1800 }), { price: 180, computedFromAmount: false, amountMismatch: false });
});

test("L-4 数量1.234kg・単価980・金額1,209(1,209.32 の円未満を切り捨てた金額)→ 1円未満の差は合っているとみなす", () => {
  assert.deepEqual(lineUnitPrice({ quantity: 1.234, unitPrice: 980, totalAmount: 1209 }), { price: 980, computedFromAmount: false, amountMismatch: false });
});

test("L-5 単価が無く、数量が0や不明 → 単価は空欄(計算しない)", () => {
  assert.deepEqual(lineUnitPrice({ quantity: 0, unitPrice: null, totalAmount: 1800 }), { price: null, computedFromAmount: false, amountMismatch: false });
  assert.deepEqual(lineUnitPrice({ quantity: null, unitPrice: null, totalAmount: 1800 }), { price: null, computedFromAmount: false, amountMismatch: false });
  assert.deepEqual(lineUnitPrice({ quantity: 10, unitPrice: null, totalAmount: null }), { price: null, computedFromAmount: false, amountMismatch: false });
});

// ---------- 税込・税抜(Z) ----------

test("Z-1 Mahiroの例: 玉ねぎ20個で1,100円(税抜・単価の記載なし)、店の設定が税込、1個 = 200g → 1個55円 → 税込59.4円 → 0.297円/g", () => {
  const r = computeRowPrice({
    quantity: 20,
    unitPrice: null,
    totalAmount: 1100,
    invoiceUnit: "個",
    invoiceTaxBasis: "exclusive",
    storeTaxMode: "inclusive",
    taxRatePercent: 8,
    ingredientUnit: "g",
    conversion: { amount: 200, unit: "g" },
  });
  assert.deepEqual(r, {
    lineUnitPrice: 55,
    taxAdjustedUnitPrice: 59.4,
    price: 0.297,
    kind: "converted",
    computedFromAmount: true,
    amountMismatch: false,
    needsTaxChoice: false,
  });
});

test("Z-2 納品書が税込、店の設定が税抜 → 59.4円は 55円(59.4 ÷ 1.08)", () => {
  assert.equal(adjustForTax(59.4, "inclusive", "exclusive", 8), 55);
});

test("Z-3 納品書と店の設定が同じ(税抜同士・税込同士)→ そのまま", () => {
  assert.equal(adjustForTax(55, "exclusive", "exclusive", 8), 55);
  assert.equal(adjustForTax(59.4, "inclusive", "inclusive", 8), 59.4);
});

test("Z-4 納品書の税込・税抜が分からない → 計算せず、店主に選んでもらう(needsTaxChoice)", () => {
  assert.equal(adjustForTax(55, null, "inclusive", 8), null);
  const r = computeRowPrice({
    quantity: 20,
    unitPrice: null,
    totalAmount: 1100,
    invoiceUnit: "個",
    invoiceTaxBasis: null,
    storeTaxMode: "inclusive",
    taxRatePercent: 8,
    ingredientUnit: "g",
    conversion: { amount: 200, unit: "g" },
  });
  assert.equal(r.needsTaxChoice, true);
  assert.equal(r.price, null);
  assert.equal(r.lineUnitPrice, 55); // 納品書の単価(税の調整前)は見せられる
});

test("Z-5 酒など10%の品目: 税抜1,000円、店の設定が税込 → 1,100円", () => {
  assert.equal(adjustForTax(1000, "exclusive", "inclusive", 10), 1100);
});
