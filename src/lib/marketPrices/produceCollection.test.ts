import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPeriodLabel, periodForDateInTokyo, type Period } from "./period.ts";
import { planProducePeriods, collectProducePrices, type CollectDeps } from "./produceCollection.ts";

// 野菜(青果物の旬別結果)の定期取得で、どの旬を試すか・どこでやめるか(2026-10-22、期待値はMahiroが確認済み)。
// 以前は「今日の旬と1つ前の旬」の2つしか試さず、公表が遅れた旬を二度と取りに行かない穴があった。
// 日付は日本時間(Asia/Tokyo)で旬を決める(定期実行は日本時間3時=UTC前日18時に動く)。

const P = (year: number, month: number, third: 1 | 2 | 3): Period => ({ year, month, third });
const labels = (ps: Period[]) => ps.map(formatPeriodLabel);
/** 日本時間の日時(例: "2026-10-29T03:00")を Date にする */
const jst = (s: string) => new Date(`${s}:00+09:00`);

// ── 試す旬の決め方(E-1〜E-6、E-18) ──

test("E-1 10/29 3時(日本時間)、DBの最新が10月上旬 → 10月中旬だけ試す(今の旬=10月下旬は試さない)", () => {
  assert.deepEqual(labels(planProducePeriods(P(2026, 10, 1), jst("2026-10-29T03:00")).toTry), ["2026年10月中旬"]);
});

test("E-2 11/9 3時、DBの最新が10月上旬(10/29に中旬が取れなかった) → 10月中旬・10月下旬", () => {
  assert.deepEqual(labels(planProducePeriods(P(2026, 10, 1), jst("2026-11-09T03:00")).toTry), ["2026年10月中旬", "2026年10月下旬"]);
});

test("E-3 11/9 3時、DBの最新が10月中旬 → 10月下旬", () => {
  assert.deepEqual(labels(planProducePeriods(P(2026, 10, 2), jst("2026-11-09T03:00")).toTry), ["2026年10月下旬"]);
});

test("E-4 11/9 3時、DBの最新が10月下旬 → 試す旬なし", () => {
  assert.deepEqual(planProducePeriods(P(2026, 10, 3), jst("2026-11-09T03:00")).toTry, []);
});

test("E-5 1/9 3時、DBの最新が前年12月中旬 → 前年12月下旬(年をまたぐ)", () => {
  assert.deepEqual(labels(planProducePeriods(P(2026, 12, 2), jst("2027-01-09T03:00")).toTry), ["2026年12月下旬"]);
});

test("E-6 10/9 3時、DBが空 → 9月下旬だけ(過去の分をまとめて取らない)", () => {
  assert.deepEqual(labels(planProducePeriods(null, jst("2026-10-09T03:00")).toTry), ["2026年9月下旬"]);
});

test("E-18 日本時間11/1の2時(UTCでは10/31の17時)、DBの最新が10月中旬 → 今の旬は11月上旬、試す旬は10月下旬", () => {
  const now = new Date("2026-10-31T17:00:00Z");
  assert.deepEqual(periodForDateInTokyo(now), P(2026, 11, 1));
  assert.deepEqual(labels(planProducePeriods(P(2026, 10, 2), now).toTry), ["2026年10月下旬"]);
});

test("上限: 試す対象が4旬を超えるときは古い順に4旬まで。残りの数も返す(E-10の準備)", () => {
  const plan = planProducePeriods(P(2026, 7, 2), jst("2026-10-19T03:00"));
  assert.deepEqual(labels(plan.toTry), ["2026年7月下旬", "2026年8月上旬", "2026年8月中旬", "2026年8月下旬"]);
  assert.equal(plan.remainingAfterThisRun, 4); // 9月上旬・中旬・下旬・10月上旬
});

// ── 実行の途中でやめる場合と、次の実行での続き(E-7〜E-17) ──

/** 農水省とDBの代わり。published に入っている旬だけ「公表済み」として返す */
function fakeDeps(opts: {
  latest: Period | null;
  published: Period[];
  networkErrorOn?: Period;
  readError?: boolean;
  writeError?: boolean;
  /** 1回のアクセスにかかる時間(ミリ秒)。時間による打ち切りの確認用 */
  fetchMs?: number;
}) {
  let clock = 0;
  const stored: Period[] = [];
  const requested: string[] = [];
  const key = (p: Period) => formatPeriodLabel(p);
  const deps: CollectDeps = {
    readLatestStored: async () => (opts.readError ? { ok: false, detail: "Invalid API key" } : { ok: true, latest: opts.latest }),
    fetchCsv: async (p) => {
      requested.push(key(p));
      clock += opts.fetchMs ?? 1000;
      if (opts.networkErrorOn && key(opts.networkErrorOn) === key(p)) return { status: "error", detail: "fetch failed" };
      if (!opts.published.some((x) => key(x) === key(p))) return { status: "not_published", httpStatus: 403 };
      return { status: "ok", bytes: new ArrayBuffer(1) };
    },
    saveCsv: async (p) => {
      if (opts.writeError) return { ok: false, kind: "db", detail: "permission denied" };
      stored.push(p);
      return { ok: true, itemCount: 94 };
    },
    sleep: async (ms) => {
      clock += ms;
    },
    elapsedMs: () => clock,
  };
  return { deps, stored, requested };
}

const allPublishedUntil = (last: Period): Period[] => {
  const out: Period[] = [];
  for (let p = P(2026, 1, 1); ; ) {
    out.push(p);
    if (formatPeriodLabel(p) === formatPeriodLabel(last)) return out;
    p = p.third < 3 ? P(p.year, p.month, (p.third + 1) as 2 | 3) : p.month < 12 ? P(p.year, p.month + 1, 1) : P(p.year + 1, 1, 1);
  }
};

test("E-7 E-1で10月中旬が未公表 → 1回アクセスして終わる。保存なし、応答は200", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 1), published: allPublishedUntil(P(2026, 10, 1)) });
  const r = await collectProducePrices(f.deps, jst("2026-10-29T03:00"));
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(f.requested, ["2026年10月中旬"]);
  assert.deepEqual(f.stored, []);
  assert.deepEqual(r.results.map((x) => [x.period, x.status]), [["2026年10月中旬", "not_published"]]);
  assert.equal(r.nextFrom, "2026年10月中旬");
});

test("E-8 E-2で中旬は公表済み・下旬は未公表 → 中旬を保存、12秒待って下旬を試して終わる", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 1), published: allPublishedUntil(P(2026, 10, 2)) });
  const r = await collectProducePrices(f.deps, jst("2026-11-09T03:00"));
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(f.requested, ["2026年10月中旬", "2026年10月下旬"]);
  assert.deepEqual(labels(f.stored), ["2026年10月中旬"]);
  assert.equal(r.nextFrom, "2026年10月下旬");
});

test("E-9 E-2で中旬が通信エラー → 中旬で終わる(下旬は試さない・中旬も繰り返さない)。応答は200で中身に「失敗」", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 1), published: allPublishedUntil(P(2026, 10, 3)), networkErrorOn: P(2026, 10, 2) });
  const r = await collectProducePrices(f.deps, jst("2026-11-09T03:00"));
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(f.requested, ["2026年10月中旬"]);
  assert.deepEqual(f.stored, []);
  assert.equal(r.results[0].status, "failed");
  assert.equal(r.nextFrom, "2026年10月中旬");
});

test("E-10〜E-12 上限による中断: 7月中旬から始めて、3回の実行で10月下旬まで続きを取れる", async () => {
  const published = allPublishedUntil(P(2026, 10, 3));
  // E-10: 10/19 3時、最新は7月中旬 → 4旬だけ保存
  const run1 = fakeDeps({ latest: P(2026, 7, 2), published });
  const r1 = await collectProducePrices(run1.deps, jst("2026-10-19T03:00"));
  assert.deepEqual(labels(run1.stored), ["2026年7月下旬", "2026年8月上旬", "2026年8月中旬", "2026年8月下旬"]);
  assert.equal(run1.requested.length, 4);
  assert.equal(r1.nextFrom, "2026年9月上旬");
  // E-11: 10/29 3時、最新は8月下旬 → 9月上旬〜10月上旬の4旬(10月中旬は上限で次回へ)
  const run2 = fakeDeps({ latest: P(2026, 8, 3), published });
  const r2 = await collectProducePrices(run2.deps, jst("2026-10-29T03:00"));
  assert.deepEqual(labels(run2.stored), ["2026年9月上旬", "2026年9月中旬", "2026年9月下旬", "2026年10月上旬"]);
  assert.equal(r2.nextFrom, "2026年10月中旬");
  // E-12: 11/9 3時、最新は10月上旬 → 10月中旬・下旬
  const run3 = fakeDeps({ latest: P(2026, 10, 1), published });
  const r3 = await collectProducePrices(run3.deps, jst("2026-11-09T03:00"));
  assert.deepEqual(labels(run3.stored), ["2026年10月中旬", "2026年10月下旬"]);
  assert.equal(r3.nextFrom, null); // 最新まで取得済み
});

test("E-13 時間による中断: 2つ目の保存の後で80秒を過ぎていたら、3つ目のアクセスを始めない", async () => {
  // 1回のアクセスに30秒かかる → 1つ目30秒、待ち12秒、2つ目30秒 = 72秒、次の待ち12秒で84秒 > 80秒
  const f = fakeDeps({ latest: P(2026, 7, 2), published: allPublishedUntil(P(2026, 10, 3)), fetchMs: 30_000 });
  const r = await collectProducePrices(f.deps, jst("2026-10-19T03:00"));
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(labels(f.stored), ["2026年7月下旬", "2026年8月上旬"]);
  assert.equal(f.requested.length, 2);
  assert.equal(r.nextFrom, "2026年8月中旬");
  assert.equal(r.stoppedBecause, "time_limit");
});

test("E-4の実行: 最新まで取得済みなら、アクセス0回で200", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 3), published: allPublishedUntil(P(2026, 10, 3)) });
  const r = await collectProducePrices(f.deps, jst("2026-11-09T03:00"));
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(f.requested, []);
  assert.equal(r.nextFrom, null);
});

test("E-16 DBの読み取りが失敗(鍵が無効など) → 500。農水省へはアクセスしない", async () => {
  const f = fakeDeps({ latest: null, published: [], readError: true });
  const r = await collectProducePrices(f.deps, jst("2026-10-29T03:00"));
  assert.equal(r.httpStatus, 500);
  assert.deepEqual(f.requested, []);
  assert.match(r.error ?? "", /Invalid API key/);
});

test("E-17 農水省から取得できたが、DBへの書き込みが失敗 → 500(その回はそこで終わる)", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 1), published: allPublishedUntil(P(2026, 10, 3)), writeError: true });
  const r = await collectProducePrices(f.deps, jst("2026-11-09T03:00"));
  assert.equal(r.httpStatus, 500);
  assert.deepEqual(f.requested, ["2026年10月中旬"]);
  assert.match(r.error ?? "", /permission denied/);
});

test("E-14 応答の中身: 試した旬ごとの結果と、次回どの旬から試すか", async () => {
  const f = fakeDeps({ latest: P(2026, 10, 1), published: allPublishedUntil(P(2026, 10, 2)) });
  const r = await collectProducePrices(f.deps, jst("2026-11-09T03:00"));
  assert.deepEqual(
    r.results.map((x) => ({ period: x.period, status: x.status })),
    [
      { period: "2026年10月中旬", status: "saved" },
      { period: "2026年10月下旬", status: "not_published" },
    ],
  );
  assert.equal(r.results[0].itemCount, 94);
});
