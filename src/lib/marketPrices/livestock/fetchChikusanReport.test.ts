import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findChikusanReportLink } from "./fetchChikusanReport.ts";

// 実際に取得した一覧ページ(https://www.maff.go.jp/j/chikusan/shokuniku/lin/)のHTML。
// このページには「月報告」以外にも複数のPDFリンク(Monthly食肉鶏卵速報・和牛肉の需給動向・
// 月予測・枝肉卸売価格の推移)があり、「月報告」を含むものだけを選び分ける必要がある。
const __dirname = dirname(fileURLToPath(import.meta.url));
const listingHtml = readFileSync(join(__dirname, "fixtures", "lin_listing.html"), "utf-8");

test("実データ: 複数PDFの中から「月報告」を含むリンクだけを選ぶ", () => {
  const link = findChikusanReportLink(listingHtml);
  assert.ok(link);
  assert.match(link!.linkText, /月報告/);
  assert.equal(link!.url, "https://www.maff.go.jp/j/chikusan/shokuniku/lin/attach/pdf/index-594.pdf");
});

test("該当リンクがなければnullを返す(例外にしない)", () => {
  const link = findChikusanReportLink("<html><body><a href='./x.pdf'>関係ないPDF</a></body></html>");
  assert.equal(link, null);
});

test("空のHTMLでも例外を投げない", () => {
  const link = findChikusanReportLink("");
  assert.equal(link, null);
});
