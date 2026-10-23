/**
 * アラート画面の「市場価格を何旬(何月)分まで取得済みか」の表示と、取得が遅れているかの判定(2026-10-23)。
 *
 * 背景: 2026-10-22に、本番の管理者用の鍵が無効で、市場価格の取得が9月から一度も成功していなかったことが
 * 分かった。画面にはいつのデータかが出ておらず、誰も気づけなかった(アラートは8月の比較のまま)。
 *
 * 基準(Mahiro確認済み):
 * - 野菜・果物: 「今日の旬(日本時間)」と「DBにある最新の旬」の差が4旬以上(約1か月)なら警告。
 *   農水省の公表はふだんでも2旬ほど遅れ、旬が変わった直後は3旬になるため、3旬までは正常。
 * - 食肉: 「今月」と「DBにある最新の月」の差が3か月以上なら警告(公表の時期が分からないので緩め。
 *   月報告のPDFには数か月分が入っているので、1か月取り損ねても次の回で埋まる)。
 * - 最新の1つ前の旬(月)のデータが無ければ「比較できません」と出す(アラートが黙って止まるのを防ぐ)。
 * テストは marketDataFreshness.test.ts(期待値F-1〜F-15・P-1〜P-4)。
 */
import { periodForDateInTokyo, periodIndex, previousPeriod, type Period } from "./period.ts";

export const PRODUCE_STALE_LAG_PERIODS = 4;
export const LIVESTOCK_STALE_LAG_MONTHS = 3;

export interface MarketDataInput {
  now: Date;
  produce: { latest: Period; hasPrevious: boolean; lastFetchedAt: string | null } | null;
  livestock: { latest: { year: number; month: number }; hasPrevious: boolean; lastFetchedAt: string | null } | null;
}

export interface CategoryStatus {
  /** 今日と最新の差(野菜は旬、食肉は月) */
  lag: number;
  stale: boolean;
  /** 「野菜・果物(全国の主要卸売市場):2026年10月上旬分まで取得済み(最後の取得:10月22日)」 */
  text: string;
  /** 最新の1つ前が無いときの文言。比較できるなら null */
  missingPreviousMessage: string | null;
}

export interface MarketDataStatus {
  produce: CategoryStatus | null;
  livestock: CategoryStatus | null;
  /** 市場価格が1件もない */
  noData: boolean;
  /** どれかが遅れている(またはデータが無い)。黄色の注意で出す */
  anyStale: boolean;
}

const THIRD_LABEL = ["上旬", "中旬", "下旬"] as const;

/** 日本時間の「10月22日」 */
function formatFetchedDate(iso: string | null): string | null {
  if (!iso) return null;
  const tokyo = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${tokyo.getUTCMonth() + 1}月${tokyo.getUTCDate()}日`;
}

function withFetched(base: string, lastFetchedAt: string | null): string {
  const d = formatFetchedDate(lastFetchedAt);
  return d ? `${base}(最後の取得:${d})` : base;
}

export function buildMarketDataStatus(input: MarketDataInput): MarketDataStatus {
  const today = periodForDateInTokyo(input.now);

  let produce: CategoryStatus | null = null;
  if (input.produce) {
    const { latest, hasPrevious, lastFetchedAt } = input.produce;
    const lag = periodIndex(today) - periodIndex(latest);
    const prev = previousPeriod(latest);
    produce = {
      lag,
      stale: lag >= PRODUCE_STALE_LAG_PERIODS,
      text: withFetched(`野菜・果物(全国の主要卸売市場):${latest.year}年${latest.month}月${THIRD_LABEL[latest.third - 1]}分まで取得済み`, lastFetchedAt),
      missingPreviousMessage: hasPrevious ? null : `前の旬(${prev.month}月${THIRD_LABEL[prev.third - 1]})のデータがないため、比較できません`,
    };
  }

  let livestock: CategoryStatus | null = null;
  if (input.livestock) {
    const { latest, hasPrevious, lastFetchedAt } = input.livestock;
    const lag = today.year * 12 + today.month - (latest.year * 12 + latest.month);
    const prevMonth = latest.month > 1 ? latest.month - 1 : 12;
    livestock = {
      lag,
      stale: lag >= LIVESTOCK_STALE_LAG_MONTHS,
      text: withFetched(`食肉(東京市場):${latest.year}年${latest.month}月分まで取得済み`, lastFetchedAt),
      missingPreviousMessage: hasPrevious ? null : `前の月(${prevMonth}月)のデータがないため、比較できません`,
    };
  }

  const noData = !produce && !livestock;
  return { produce, livestock, noData, anyStale: noData || Boolean(produce?.stale) || Boolean(livestock?.stale) };
}
