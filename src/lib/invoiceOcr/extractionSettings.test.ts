import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OCR_TEMPERATURE } from "./extractionSettings.ts";

// 読み取りのばらつきを小さくする設定(2026-10-28)
test("A-1 読み取りは temperature 0 で呼ぶ(指定しないと1.0になり、同じ画像でも答えがばらつく)", () => {
  assert.equal(OCR_TEMPERATURE, 0);
  const src = readFileSync(join(process.cwd(), "src", "lib", "invoiceOcr", "extractInvoiceItems.ts"), "utf8");
  assert.match(src, /temperature: OCR_TEMPERATURE/);
});
