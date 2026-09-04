import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseChikusanPdf } from "./parseChikusanPdf.ts";

// 農水省「畜産物卸売価格の推移(月報告)」令和8年8月分を実際にダウンロードして保存した実データ
// (https://www.maff.go.jp/j/chikusan/shokuniku/lin/attach/pdf/index-594.pdf)
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "index-594.pdf"));

test("実データ: タイトルを読み取れる", async () => {
  const result = await parseChikusanPdf(fixtureBytes);
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    // このPDFはタイトル行を1文字ずつ別要素として出力しているため、空白を除いて比較する
    assert.match((result.title ?? "").replace(/\s+/g, ""), /畜産物卸売価格の推移/);
  }
});

test("実データ: 月別・旬別・日別の行がすべて期待件数パースできる(pdftotextでは日本語が読めなかった箇所)", async () => {
  const result = await parseChikusanPdf(fixtureBytes);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const kinds = result.rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  assert.equal(kinds.daily, 31); // 8月は31日
  assert.ok((kinds.monthly ?? 0) >= 2);
  assert.ok((kinds.third ?? 0) >= 3);
});

test("実データ: 8年7月(直近の確定月)の価格が実際の値と一致する", async () => {
  const result = await parseChikusanPdf(fixtureBytes);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const row = result.rows.find((r) => r.kind === "monthly" && r.rowLabel.replace(/\s+/g, "") === "8年7月");
  assert.ok(row);
  assert.equal(row!.prices.pork_tokyo, 731);
  assert.equal(row!.prices.wagyu_a5, 2652);
  assert.equal(row!.prices.wagyu_a4, 2452);
  assert.equal(row!.prices.cross_b3, 1894);
  assert.equal(row!.prices.dairy_b2, 1320);
  assert.equal(row!.prices.mature_cattle_m, 303);
  assert.equal(row!.prices.chicken_thigh, 837);
  assert.equal(row!.prices.chicken_breast, 479);
});

test("実データ: 休市日(土日)で欠測している列は null になる", async () => {
  const result = await parseChikusanPdf(fixtureBytes);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const sunday = result.rows.find((r) => r.kind === "daily" && r.rowLabel === "2日");
  assert.ok(sunday);
  assert.equal(sunday!.weekday, "日");
  assert.equal(sunday!.prices.pork_tokyo, null);
});

test("鶏肉もも肉の価格はむね肉より高い(実データの妥当性チェック)", async () => {
  const result = await parseChikusanPdf(fixtureBytes);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const monthlyRows = result.rows.filter((r) => r.kind === "monthly");
  for (const row of monthlyRows) {
    if (row.prices.chicken_thigh != null && row.prices.chicken_breast != null) {
      assert.ok(row.prices.chicken_thigh > row.prices.chicken_breast);
    }
  }
});

test("列数が想定と異なる(空/壊れた)PDFはエラーを投げず unexpected_layout を返す", async () => {
  const result = await parseChikusanPdf(new TextEncoder().encode("not a pdf"));
  assert.equal(result.status, "unexpected_layout");
});
