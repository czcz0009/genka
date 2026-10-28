import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoiceFile, checkPdfPageCount, checkUploadSet } from "./uploadSet.ts";

// PDF・複数枚の読み取り(設計の5段目、2026-10-28)。期待値F-1〜F-12はMahiroが確認する。
// 写真は1回に5枚まで(同じ納品書の続きのページ)、PDFは1回に1つ・5ページまで。写真とPDFは混ぜない。合計3.5MBまで。

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF");
const PDF = bytes("%PDF-1.7\n");
const MB = 1024 * 1024;

test("F-1 PDF(中身の先頭が %PDF-)を受け付ける", () => {
  assert.deepEqual(checkInvoiceFile({ declaredType: "application/pdf", size: 1000, head: PDF }), { ok: true, kind: "pdf" });
  assert.deepEqual(checkInvoiceFile({ declaredType: "", size: 1000, head: PDF }), { ok: true, kind: "pdf" }); // 申告が空でも中身で判定
});

test("F-2 写真は今までどおり(JPEG等)。中身で判定する", () => {
  assert.deepEqual(checkInvoiceFile({ declaredType: "image/jpeg", size: 1000, head: JPEG }), { ok: true, kind: "jpeg" });
});

test("F-3 PDFと申告していても、中身が違えば(文字のファイル等)受け付けない。Word・Excel等も受け付けない", () => {
  const msg = "JPEG・PNG・WebP・HEICの写真か、PDFを選択してください";
  assert.deepEqual(checkInvoiceFile({ declaredType: "application/pdf", size: 1000, head: bytes("<html>") }), { ok: false, error: msg });
  assert.deepEqual(checkInvoiceFile({ declaredType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000, head: bytes("PK", [3, 4]) }), {
    ok: false,
    error: msg,
  });
});

test("F-4 3.5MBを超えるPDFは受け付けない(3.5MBちょうどは受け付ける)", () => {
  assert.deepEqual(checkInvoiceFile({ declaredType: "application/pdf", size: 3.5 * MB + 1, head: PDF }), {
    ok: false,
    error: "ファイルが大きすぎます(3.5MBまで)。PDFは、必要なページだけにしてから選んでください",
  });
  assert.equal(checkInvoiceFile({ declaredType: "application/pdf", size: 3.5 * MB, head: PDF }).ok, true);
});

test("F-5 PDFのページ数: 1〜5ページは受け付ける。6ページ以上・ページが読めない(0)は受け付けない", () => {
  assert.equal(checkPdfPageCount(1), null);
  assert.equal(checkPdfPageCount(5), null);
  assert.equal(checkPdfPageCount(6), "PDFは5ページまでです(このファイルは6ページ)。必要なページだけのPDFにしてから選んでください");
  assert.equal(checkPdfPageCount(0), "PDFのページを読めませんでした。別のファイルでお試しください");
  assert.equal(checkPdfPageCount(null), "PDFのページを読めませんでした。別のファイルでお試しください"); // 壊れている・パスワード付き
});

test("F-6 何も選んでいない → 選んでもらう", () => {
  assert.equal(checkUploadSet([]), "写真かPDFを選択してください");
});

test("F-7 写真は1回に5枚まで(5枚は受け付ける)", () => {
  const img = { kind: "jpeg" as const, size: 300 * 1024 };
  assert.equal(checkUploadSet(Array(5).fill(img)), null);
  assert.equal(checkUploadSet(Array(6).fill(img)), "写真は1回に5枚までです。同じ納品書の続きのページだけを選んでください");
});

test("F-8 PDFは1回に1つまで。写真とPDFは混ぜない", () => {
  const pdf = { kind: "pdf" as const, size: 100 * 1024 };
  assert.equal(checkUploadSet([pdf]), null);
  assert.equal(checkUploadSet([pdf, pdf]), "PDFは1回に1つずつ読み取ってください");
  assert.equal(checkUploadSet([pdf, { kind: "jpeg", size: 1000 }]), "PDFと写真は、別々に読み取ってください");
});

test("F-9 写真の合計が3.5MBを超える → 枚数を減らしてもらう(ブラウザで縮小した後の大きさで数える)", () => {
  assert.equal(checkUploadSet([{ kind: "jpeg", size: 2 * MB }, { kind: "jpeg", size: 1.5 * MB }]), null);
  assert.equal(
    checkUploadSet([{ kind: "jpeg", size: 2 * MB }, { kind: "jpeg", size: 1.5 * MB + 1 }]),
    "選んだ写真の合計が大きすぎます(3.5MBまで)。枚数を減らしてください",
  );
});
