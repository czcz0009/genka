import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarketDataStatus } from "./marketDataFreshness.ts";
import type { Period } from "./period.ts";

// アラート画面の「市場価格を何旬分まで取得済みか」の表示と、取得が遅れているかの判定(2026-10-23)。
// 期待値F-1〜F-15・P-1〜P-4はMahiroが確認済み。
// 基準: 野菜は「今日の旬(日本時間)」と「DBにある最新の旬」の差が4旬以上(約1か月)で警告。
//       食肉は「今月」と「DBにある最新の月」の差が3か月以上で警告。
// 農水省の公表はふだんでも2旬ほど遅れる(10/22の時点で最新は10月上旬、10月中旬は未公表)ため、
// 3旬までは正常とする(ふだんの遅れで誤って警告しない)。

const P = (year: number, month: number, third: 1 | 2 | 3): Period => ({ year, month, third });
const jst = (s: string) => new Date(`${s}T12:00:00+09:00`);

function produce(now: string, latest: Period | null) {
  return buildMarketDataStatus({
    now: jst(now),
    produce: latest ? { latest, hasPrevious: true, lastFetchedAt: null } : null,
    livestock: null,
  }).produce;
}
function livestock(now: string, year: number, month: number) {
  return buildMarketDataStatus({
    now: jst(now),
    produce: null,
    livestock: { latest: { year, month }, hasPrevious: true, lastFetchedAt: null },
  }).livestock;
}

const cases: [string, string, Period, number, boolean][] = [
  ["F-1 今日の実際の状態(10月中旬はまだ公表されていない)", "2026-10-22", P(2026, 10, 1), 2, false],
  ["F-2 10/29に中旬が取れなかった場合も、月末まで警告しない", "2026-10-31", P(2026, 10, 1), 2, false],
  ["F-3 旬が変わった直後の、ふだんの遅れ", "2026-11-01", P(2026, 10, 1), 3, false],
  ["F-4 境界の手前", "2026-11-10", P(2026, 10, 1), 3, false],
  ["F-5 中旬も下旬も取れずに1か月たった", "2026-11-11", P(2026, 10, 1), 4, true],
  ["F-6 1旬でも進んでいれば警告しない", "2026-11-11", P(2026, 10, 2), 3, false],
  ["F-7 今回の事故の状態(9/4から止まっていた)", "2026-10-22", P(2026, 8, 3), 6, true],
  ["F-8 今回の事故なら、10/1には気づけていた", "2026-10-01", P(2026, 8, 3), 4, true],
  ["F-9 事故の初期は、まだ警告しない(遅れとの見分けがつかない)", "2026-09-29", P(2026, 8, 3), 3, false],
  ["F-10 年をまたぐ計算(正常)", "2027-01-05", P(2026, 12, 2), 2, false],
  ["F-11 年をまたぐ計算(警告)", "2027-01-15", P(2026, 12, 1), 4, true],
];
for (const [label, now, latest, lag, stale] of cases) {
  test(`${label}: 今日 ${now}、DBの最新 ${latest.year}年${latest.month}月${["上", "中", "下"][latest.third - 1]}旬 → 差${lag}旬、${stale ? "警告" : "正常"}`, () => {
    const r = produce(now, latest)!;
    assert.equal(r.lag, lag);
    assert.equal(r.stale, stale);
  });
}

test("F-12 食肉: 10/22、最新が2026年9月 → 差1か月、正常", () => {
  const r = livestock("2026-10-22", 2026, 9)!;
  assert.deepEqual({ lag: r.lag, stale: r.stale }, { lag: 1, stale: false });
});

test("F-13 食肉: 11/30、最新が2026年9月(10月の月報告が11/6の実行に間に合わなかった)→ 差2か月、正常", () => {
  const r = livestock("2026-11-30", 2026, 9)!;
  assert.deepEqual({ lag: r.lag, stale: r.stale }, { lag: 2, stale: false });
});

test("F-14 食肉: 12/1、最新が2026年9月 → 差3か月、警告", () => {
  const r = livestock("2026-12-01", 2026, 9)!;
  assert.deepEqual({ lag: r.lag, stale: r.stale }, { lag: 3, stale: true });
});

test("F-15 データが1件もない → 「まだ取得していません」(警告として扱う)", () => {
  const s = buildMarketDataStatus({ now: jst("2026-10-22"), produce: null, livestock: null });
  assert.equal(s.produce, null);
  assert.equal(s.livestock, null);
  assert.equal(s.noData, true);
  assert.equal(s.anyStale, true);
});

// ── 「前の旬(前の月)のデータがないため、比較できません」 ──

test("P-1 最新が10月上旬、9月下旬あり → 表示しない(比較できる)", () => {
  const s = buildMarketDataStatus({ now: jst("2026-10-22"), produce: { latest: P(2026, 10, 1), hasPrevious: true, lastFetchedAt: null }, livestock: null });
  assert.equal(s.produce!.missingPreviousMessage, null);
});

test("P-2 最新が10月上旬、9月下旬なし → 「前の旬(9月下旬)のデータがないため、比較できません」", () => {
  const s = buildMarketDataStatus({ now: jst("2026-10-22"), produce: { latest: P(2026, 10, 1), hasPrevious: false, lastFetchedAt: null }, livestock: null });
  assert.equal(s.produce!.missingPreviousMessage, "前の旬(9月下旬)のデータがないため、比較できません");
});

test("P-3 最新が8月下旬だけ(9/4〜10/21の本番の状態)→ 「前の旬(8月中旬)のデータがないため、比較できません」", () => {
  const s = buildMarketDataStatus({ now: jst("2026-10-22"), produce: { latest: P(2026, 8, 3), hasPrevious: false, lastFetchedAt: null }, livestock: null });
  assert.equal(s.produce!.missingPreviousMessage, "前の旬(8月中旬)のデータがないため、比較できません");
});

test("P-4 食肉の最新が9月、8月なし → 「前の月(8月)のデータがないため、比較できません」", () => {
  const s = buildMarketDataStatus({ now: jst("2026-10-22"), produce: null, livestock: { latest: { year: 2026, month: 9 }, hasPrevious: false, lastFetchedAt: null } });
  assert.equal(s.livestock!.missingPreviousMessage, "前の月(8月)のデータがないため、比較できません");
});

// ── 表示する文言 ──

test("文言(正常): 何旬分まで取得済みかと、最後の取得日(日本時間)", () => {
  const s = buildMarketDataStatus({
    now: jst("2026-10-22"),
    produce: { latest: P(2026, 10, 1), hasPrevious: true, lastFetchedAt: "2026-10-22T05:38:54Z" },
    livestock: { latest: { year: 2026, month: 9 }, hasPrevious: true, lastFetchedAt: "2026-10-22T05:38:54Z" },
  });
  assert.equal(s.anyStale, false);
  assert.equal(s.produce!.text, "野菜・果物(全国の主要卸売市場):2026年10月上旬分まで取得済み(最後の取得:10月22日)");
  assert.equal(s.livestock!.text, "食肉(東京市場):2026年9月分まで取得済み(最後の取得:10月22日)");
});

test("文言(警告): 取得が止まっている可能性", () => {
  const s = buildMarketDataStatus({
    now: jst("2026-10-22"),
    produce: { latest: P(2026, 8, 3), hasPrevious: false, lastFetchedAt: "2026-09-04T07:51:43Z" },
    livestock: null,
  });
  assert.equal(s.anyStale, true);
  assert.equal(s.produce!.text, "野菜・果物(全国の主要卸売市場):2026年8月下旬分まで取得済み(最後の取得:9月4日)");
  assert.equal(s.produce!.stale, true);
});
