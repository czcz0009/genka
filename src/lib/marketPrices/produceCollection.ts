/**
 * 野菜(青果物の旬別結果)の定期取得で、どの旬を試すか・どこでやめるか(2026-10-22)。
 *
 * 以前は「今日の旬と1つ前の旬」の2つしか試さなかった。各旬が実際に取れる機会は
 * 「旬が終わって約8日後の1回」だけで、農水省の公表がそれより遅いと、その旬は二度と
 * 取りに行かず穴になっていた(穴があると、次の旬が入ったときに「前の旬」が無く、
 * 野菜のアラートが黙って止まる)。
 *
 * 今の決まり:
 * - 「DBにある最新の旬の次」から「終わっている直近の旬(今日の1つ前の旬)」までを、古い順に試す。
 *   まだ終わっていない今の旬は、必ず未公表なので試さない。
 * - 1回の実行で試すのは4旬まで。残りは次の実行で続きから取る。
 * - 未公表・通信エラーなら、その回はそこでやめる(旬は順番に公表されるため。同じ回の中で繰り返さない)。
 * - アクセスの間は12秒あける。開始から80秒を過ぎたら、新しいアクセスは始めない(関数の上限は120秒)。
 * - DBの読み書きの失敗(鍵・権限・接続)は500で返す(手動実行の応答で、すぐ気づけるように。
 *   2026-10-22に、鍵が無効で9月から失敗していたのを見逃した反省)。
 * - 旬は日本時間(Asia/Tokyo)で決める。
 * テストは produceCollection.test.ts(期待値E-1〜E-18はMahiroが確認済み)。
 */
import { formatPeriodLabel, nextPeriod, periodForDateInTokyo, periodIndex, previousPeriod, type Period } from "./period.ts";
import type { FetchSyuyoResult } from "./fetchSyuyoCsv.ts";

export const MAX_PERIODS_PER_RUN = 4;
export const WAIT_BETWEEN_REQUESTS_MS = 12_000;
/** これを過ぎたら新しいアクセスを始めない(関数の上限 maxDuration=120秒 より十分短く) */
export const TIME_BUDGET_MS = 80_000;

export interface ProducePlan {
  /** この回に試す旬(古い順、最大4旬) */
  toTry: Period[];
  /** 上限のため、この回では試さずに次回へ回る旬の数 */
  remainingAfterThisRun: number;
}

export function planProducePeriods(latestStored: Period | null, now: Date): ProducePlan {
  const lastEnded = previousPeriod(periodForDateInTokyo(now));
  if (!latestStored) {
    // DBが空のときは、過去の分をまとめて取らず、終わっている直近の1旬だけ
    return { toTry: [lastEnded], remainingAfterThisRun: 0 };
  }
  const all: Period[] = [];
  for (let p = nextPeriod(latestStored); periodIndex(p) <= periodIndex(lastEnded); p = nextPeriod(p)) all.push(p);
  return { toTry: all.slice(0, MAX_PERIODS_PER_RUN), remainingAfterThisRun: Math.max(0, all.length - MAX_PERIODS_PER_RUN) };
}

export type SaveResult = { ok: true; itemCount: number } | { ok: false; kind: "db" | "parse"; detail: string };

export interface CollectDeps {
  readLatestStored: () => Promise<{ ok: true; latest: Period | null } | { ok: false; detail: string }>;
  fetchCsv: (p: Period) => Promise<FetchSyuyoResult>;
  saveCsv: (p: Period, bytes: ArrayBuffer) => Promise<SaveResult>;
  sleep: (ms: number) => Promise<void>;
  /** 実行を始めてからの経過時間(ミリ秒) */
  elapsedMs: () => number;
}

export interface PeriodResult {
  period: string;
  status: "saved" | "not_published" | "failed";
  itemCount?: number;
  detail?: string;
}

export interface CollectResult {
  httpStatus: 200 | 500;
  /** 500のときの理由(DBの読み書きの失敗) */
  error?: string;
  results: PeriodResult[];
  /** 次の実行でどの旬から試すか。最新まで取得済みならnull */
  nextFrom: string | null;
  stoppedBecause?: "not_published" | "fetch_failed" | "time_limit" | "per_run_limit" | "parse_failed";
}

export async function collectProducePrices(deps: CollectDeps, now: Date): Promise<CollectResult> {
  const latest = await deps.readLatestStored();
  if (!latest.ok) {
    // DBが読めない(鍵が無効など)なら、農水省へはアクセスしない
    return { httpStatus: 500, error: `DBの読み取りに失敗: ${latest.detail}`, results: [], nextFrom: null };
  }
  const plan = planProducePeriods(latest.latest, now);
  const results: PeriodResult[] = [];
  let stoppedAt: Period | null = null;
  let stoppedBecause: CollectResult["stoppedBecause"];

  for (let i = 0; i < plan.toTry.length; i++) {
    const p = plan.toTry[i];
    if (i > 0) {
      if (deps.elapsedMs() + WAIT_BETWEEN_REQUESTS_MS > TIME_BUDGET_MS) {
        stoppedAt = p;
        stoppedBecause = "time_limit";
        break;
      }
      await deps.sleep(WAIT_BETWEEN_REQUESTS_MS);
    }
    const fetched = await deps.fetchCsv(p); // 1ファイル1回。失敗しても繰り返さない
    if (fetched.status === "not_published") {
      results.push({ period: formatPeriodLabel(p), status: "not_published", detail: `HTTP ${fetched.httpStatus}` });
      stoppedAt = p;
      stoppedBecause = "not_published";
      break;
    }
    if (fetched.status === "error") {
      results.push({ period: formatPeriodLabel(p), status: "failed", detail: `農水省からの取得に失敗: ${fetched.detail}` });
      stoppedAt = p;
      stoppedBecause = "fetch_failed";
      break;
    }
    const saved = await deps.saveCsv(p, fetched.bytes);
    if (!saved.ok && saved.kind === "db") {
      results.push({ period: formatPeriodLabel(p), status: "failed", detail: `DBへの書き込みに失敗: ${saved.detail}` });
      return { httpStatus: 500, error: `DBへの書き込みに失敗: ${saved.detail}`, results, nextFrom: formatPeriodLabel(p) };
    }
    if (!saved.ok) {
      results.push({ period: formatPeriodLabel(p), status: "failed", detail: `CSVの読み取りに失敗: ${saved.detail}` });
      stoppedAt = p;
      stoppedBecause = "parse_failed";
      break;
    }
    results.push({ period: formatPeriodLabel(p), status: "saved", itemCount: saved.itemCount });
  }

  if (!stoppedAt && plan.remainingAfterThisRun > 0) {
    stoppedAt = nextPeriod(plan.toTry[plan.toTry.length - 1]);
    stoppedBecause = "per_run_limit";
  }
  return { httpStatus: 200, results, nextFrom: stoppedAt ? formatPeriodLabel(stoppedAt) : null, stoppedBecause };
}
