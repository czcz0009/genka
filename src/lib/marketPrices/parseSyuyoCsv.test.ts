import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSyuyoCsv } from "./parseSyuyoCsv.ts";

// 2026年7月下旬・主要卸売市場計を実際にダウンロードして保存した実データ
// (https://www.maff.go.jp/j/tokei/syohi/shunbetu/2026/csv/26073h_syuyo.csv)
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "26073h_syuyo.csv"));

test("実データ: タイトル行の和暦から対象期間を西暦に変換できる", () => {
  const { period } = parseSyuyoCsv(fixtureBytes);
  assert.deepEqual(period, { year: 2026, month: 7, third: 3 });
});

test("実データ: 品目数がそれなりの件数パースできる(野菜・果実あわせて100件前後)", () => {
  const { items } = parseSyuyoCsv(fixtureBytes);
  assert.ok(items.length > 80, `items.length=${items.length}`);
});

test("実データ: 通常の品目行を正しく数値変換する(だいこん)", () => {
  const { items } = parseSyuyoCsv(fixtureBytes);
  const daikon = items.find((i) => i.itemName === "だいこん");
  assert.ok(daikon);
  assert.equal(daikon!.itemCode, "30100");
  assert.equal(daikon!.isBreakdownRow, false);
  assert.equal(daikon!.wholesaleQuantityTon, 6017);
  assert.equal(daikon!.pricePerKg, 107);
  assert.equal(daikon!.yoyQuantityPercent, 98);
});

test("実データ: 「うち輸入」の内訳行はisBreakdownRow=trueになる", () => {
  const { items } = parseSyuyoCsv(fixtureBytes);
  const breakdownRows = items.filter((i) => i.isBreakdownRow);
  assert.ok(breakdownRows.length > 0);
  for (const row of breakdownRows) {
    assert.match(row.itemName, /^うち/);
  }
});

test("実データ: 「－」(欠測値プレースホルダ)はnullとして読み取れる", () => {
  const { items } = parseSyuyoCsv(fixtureBytes);
  // 実えんどう(35300)は今回の実データで対前年比等が「－」になっている行
  const item = items.find((i) => i.itemCode === "35300");
  assert.ok(item);
  assert.equal(item!.yoyQuantityPercent, null);
  assert.equal(item!.yoyPricePercent, null);
});

test("見出し行が見つからない/空のCSVはエラーを投げず空配列を返す", () => {
  const { period, items } = parseSyuyoCsv(new TextEncoder().encode("not a csv"));
  assert.equal(period, null);
  assert.deepEqual(items, []);
});
