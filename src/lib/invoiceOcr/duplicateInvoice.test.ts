import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSupplier, findPossibleDuplicate, duplicateNotice } from "./duplicateInvoice.ts";

// 同じ納品書の二度読みに気づく決まり(2026-10-28)。日付・仕入れ先・合計金額の3つ、または日付・合計金額の2つが一致したら知らせる(止めはしない)。
// 期待値はMahiroが確認する。

const records = [
  { invoiceDate: "2026-10-20", supplierNormalized: "山田青果", totalAmount: 12960, createdAt: "2026-10-20T09:15:00+09:00" },
  { invoiceDate: "2026-10-21", supplierNormalized: "佐藤精肉店", totalAmount: 8640, createdAt: "2026-10-21T10:00:00+09:00" },
];

test("D-1 仕入れ先の書き方のゆれ(株式会社・(株)・㈱・有限会社・空白・全角半角)をそろえる", () => {
  assert.equal(normalizeSupplier("(株)山田青果"), "山田青果");
  assert.equal(normalizeSupplier("山田青果 株式会社"), "山田青果");
  assert.equal(normalizeSupplier("㈱ 山田 青果"), "山田青果");
  assert.equal(normalizeSupplier("有限会社 佐藤精肉店"), "佐藤精肉店");
  assert.equal(normalizeSupplier("（有）佐藤精肉店"), "佐藤精肉店");
  assert.equal(normalizeSupplier("ＡＢＣ食品"), "abc食品");
});

test("D-2 日付・仕入れ先・合計金額が一致 → 読み取り済みかもしれない(前の記録を返す)", () => {
  const hit = findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier: "(株)山田青果", totalAmount: 12960 }, records);
  assert.equal(hit?.createdAt, "2026-10-20T09:15:00+09:00");
  assert.equal(hit?.sameSupplier, true);
  assert.equal(duplicateNotice(hit!), "この納品書は読み取り済みかもしれません(10月20日に確定した納品書と、日付・仕入れ先・合計金額が同じです)。同じ納品書なら、確定しなくても大丈夫です");
});

test("D-3 合計か日付が違えば知らせない(合計が1円違う・日付が違う)", () => {
  assert.equal(findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier: "山田青果", totalAmount: 12961 }, records), null);
  assert.equal(findPossibleDuplicate({ invoiceDate: "2026-10-19", supplier: "山田青果", totalAmount: 12960 }, records), null);
});

test("D-4 日付か合計が読み取れなかった → 確かめない(知らせない)", () => {
  assert.equal(findPossibleDuplicate({ invoiceDate: null, supplier: "山田青果", totalAmount: 12960 }, records), null);
  assert.equal(findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier: "山田青果", totalAmount: null }, records), null);
});

// 2026-10-28の指示: 仕入れ先の読み違い(「テスト青果」を「テスト青県」と読む等)があっても気づけるように、日付と合計の2つが一致したときにも知らせる
test("D-5 日付と合計が一致し、仕入れ先が違う → 知らせる。前回読み取った仕入れ先の名前も見せる", () => {
  const hit = findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier: "山田青県", totalAmount: 12960 }, records);
  assert.equal(hit?.sameSupplier, false);
  assert.equal(
    duplicateNotice(hit!),
    "同じ日付・同じ合計金額の納品書を、すでに確定しています(仕入れ先の名前は、前回『山田青果』と読み取りました)。同じ納品書なら、確定しなくても大丈夫です",
  );
});

test("D-6 日付と合計が一致し、仕入れ先が読み取れなかった(空・「株式会社」だけ)→ D-5と同じお知らせ", () => {
  for (const supplier of [null, "株式会社"]) {
    const hit = findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier, totalAmount: 12960 }, records);
    assert.equal(hit?.sameSupplier, false);
    assert.equal(hit?.supplierNormalized, "山田青果");
  }
});

test("D-7 同じ日付・合計の記録が複数あれば、仕入れ先まで一致するものを優先する(今の文言のまま)", () => {
  const many = [
    { invoiceDate: "2026-10-20", supplierNormalized: "佐藤精肉店", totalAmount: 12960, createdAt: "2026-10-20T08:00:00+09:00" },
    ...records,
  ];
  const hit = findPossibleDuplicate({ invoiceDate: "2026-10-20", supplier: "(株)山田青果", totalAmount: 12960 }, many);
  assert.equal(hit?.sameSupplier, true);
  assert.equal(hit?.supplierNormalized, "山田青果");
  assert.match(duplicateNotice(hit!), /^この納品書は読み取り済みかもしれません\(10月20日に確定した/);
});
