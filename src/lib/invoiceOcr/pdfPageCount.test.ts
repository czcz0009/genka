import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countPdfPages } from "./pdfPageCount.ts";

// PDFのページ数を数える(2026-10-28)。
test("PC-1 本物のPDF(農水省の食肉のPDF、手元に保存したもの)のページ数を数えられる。元の中身は壊さない", async () => {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "src", "lib", "marketPrices", "livestock", "fixtures", "index-602.pdf")));
  const before = bytes.length;
  const n = await countPdfPages(bytes);
  assert.ok(n != null && n >= 1, `ページ数: ${n}`);
  assert.equal(bytes.length, before);
});

test("PC-2 PDFでない・壊れている中身は null(読めない)", async () => {
  assert.equal(await countPdfPages(new TextEncoder().encode("%PDF-1.7\nこわれたファイル")), null);
  assert.equal(await countPdfPages(new Uint8Array()), null);
});
