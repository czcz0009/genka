import { test } from "node:test";
import assert from "node:assert/strict";
import { monthToPeriod, previousMonthString, formatMonthLabel, recentMonths } from "./month.ts";

test("monthToPeriod: 通常の月(31日)", () => {
  assert.deepEqual(monthToPeriod("2026-08"), { start: "2026-08-01", end: "2026-08-31" });
});

test("monthToPeriod: 30日の月", () => {
  assert.deepEqual(monthToPeriod("2026-04"), { start: "2026-04-01", end: "2026-04-30" });
});

test("monthToPeriod: うるう年の2月", () => {
  assert.deepEqual(monthToPeriod("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("monthToPeriod: 平年の2月", () => {
  assert.deepEqual(monthToPeriod("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
});

test("previousMonthString: 通常", () => {
  assert.equal(previousMonthString("2026-08"), "2026-07");
});

test("previousMonthString: 年をまたぐ(1月->前年12月)", () => {
  assert.equal(previousMonthString("2026-01"), "2025-12");
});

test("formatMonthLabel", () => {
  assert.equal(formatMonthLabel("2026-08"), "2026年8月");
});

test("recentMonths: 指定月を含む直近N ヶ月を古い順で返す", () => {
  assert.deepEqual(recentMonths("2026-08", 3), ["2026-06", "2026-07", "2026-08"]);
});

test("recentMonths: 年またぎ", () => {
  assert.deepEqual(recentMonths("2026-01", 3), ["2025-11", "2025-12", "2026-01"]);
});
