import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseChikusanPdf } from "./parseChikusanPdf.ts";
import { selectMonthlyComparisonPair, toMarketItems } from "./monthlyComparison.ts";
import { detectPriceChanges } from "../detectPriceChanges.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "index-594.pdf"));

test("selectMonthlyComparisonPair: 実データから最新2ヶ月分(8年7月・8年8月)を取り出せる", async () => {
  const parsed = await parseChikusanPdf(fixtureBytes);
  assert.equal(parsed.status, "ok");
  if (parsed.status !== "ok") return;

  const pair = selectMonthlyComparisonPair(parsed.rows);
  assert.ok(pair);
  assert.deepEqual(pair!.current.period, { year: 2026, month: 8 });
  assert.deepEqual(pair!.previous.period, { year: 2026, month: 7 });
});

test("toMarketItems + detectPriceChanges: ①③向けの汎用ロジックにそのまま乗せて変動検知できる", async () => {
  const parsed = await parseChikusanPdf(fixtureBytes);
  assert.equal(parsed.status, "ok");
  if (parsed.status !== "ok") return;

  const pair = selectMonthlyComparisonPair(parsed.rows)!;
  const currentItems = toMarketItems(pair.current.row);
  const previousItems = toMarketItems(pair.previous.row);

  // 実データ: 豚肉は 8年7月=731円/kg -> 8年8月=665円/kg (約-9%、閾値5%なら検知される)
  const events = detectPriceChanges(currentItems, previousItems, 5);
  const pork = events.find((e) => e.itemCode === "pork_tokyo");
  assert.ok(pork);
  assert.equal(pork!.direction, "down");
});

test("selectMonthlyComparisonPair: 月次サマリー行が1件以下ならnull", () => {
  const pair = selectMonthlyComparisonPair([
    { kind: "monthly", rowLabel: "8年 8月", weekday: null, prices: {} },
  ]);
  assert.equal(pair, null);
});
