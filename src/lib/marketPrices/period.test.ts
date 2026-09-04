import { test } from "node:test";
import assert from "node:assert/strict";
import { previousPeriod, nextPeriod, buildSyuyoCsvUrl, formatPeriodLabel, periodForDate } from "./period.ts";

test("previousPeriod: 同じ月内は旬番号を1つ戻す", () => {
  assert.deepEqual(previousPeriod({ year: 2026, month: 7, third: 3 }), {
    year: 2026,
    month: 7,
    third: 2,
  });
});

test("previousPeriod: 月初(上旬)からは前月の下旬に戻る", () => {
  assert.deepEqual(previousPeriod({ year: 2026, month: 7, third: 1 }), {
    year: 2026,
    month: 6,
    third: 3,
  });
});

test("previousPeriod: 1月上旬からは前年12月下旬に戻る(年またぎ)", () => {
  assert.deepEqual(previousPeriod({ year: 2026, month: 1, third: 1 }), {
    year: 2025,
    month: 12,
    third: 3,
  });
});

test("nextPeriod は previousPeriod の逆になる", () => {
  const cases = [
    { year: 2026, month: 7, third: 1 as const },
    { year: 2026, month: 7, third: 3 as const },
    { year: 2025, month: 12, third: 3 as const },
    { year: 2026, month: 1, third: 1 as const },
  ];
  for (const p of cases) {
    assert.deepEqual(nextPeriod(previousPeriod(p)), p);
  }
});

test("buildSyuyoCsvUrl: 実際に取得できたURLパターンと一致する", () => {
  assert.equal(
    buildSyuyoCsvUrl({ year: 2026, month: 7, third: 3 }),
    "https://www.maff.go.jp/j/tokei/syohi/shunbetu/2026/csv/26073h_syuyo.csv",
  );
});

test("buildSyuyoCsvUrl: 月は2桁ゼロ埋めする", () => {
  assert.equal(
    buildSyuyoCsvUrl({ year: 2026, month: 3, third: 1 }),
    "https://www.maff.go.jp/j/tokei/syohi/shunbetu/2026/csv/26031h_syuyo.csv",
  );
});

test("periodForDate: 1〜10日は上旬", () => {
  assert.deepEqual(periodForDate(new Date(2026, 6, 1)), { year: 2026, month: 7, third: 1 });
  assert.deepEqual(periodForDate(new Date(2026, 6, 10)), { year: 2026, month: 7, third: 1 });
});

test("periodForDate: 11〜20日は中旬", () => {
  assert.deepEqual(periodForDate(new Date(2026, 6, 11)), { year: 2026, month: 7, third: 2 });
  assert.deepEqual(periodForDate(new Date(2026, 6, 20)), { year: 2026, month: 7, third: 2 });
});

test("periodForDate: 21日〜月末は下旬", () => {
  assert.deepEqual(periodForDate(new Date(2026, 6, 21)), { year: 2026, month: 7, third: 3 });
  assert.deepEqual(periodForDate(new Date(2026, 6, 31)), { year: 2026, month: 7, third: 3 });
});

test("formatPeriodLabel", () => {
  assert.equal(formatPeriodLabel({ year: 2026, month: 7, third: 3 }), "2026年7月下旬");
});
