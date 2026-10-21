import { FL_BENCHMARK_PERCENT, classifySeverity, exceedsBenchmark, type Severity } from "./flRatio.ts";

/**
 * ダッシュボードの「今月のFL比率」カードと、「前回から変わったこと」のFL比率の行の表示を決める。
 *
 * FL比率の画面(fl-ratio/FlRatioView.tsx)と同じ扱いにそろえている(2026-10-21):
 * - 単価未設定の食材を含むメニュー(今月の販売実績があるもの)がある間は、FL比率は下限値なので
 *   「◯%以上」・灰色・色分けなし。目安(60%)を超えた場合だけ「注意」。
 * - 全メニューが計算できているときは、FL比率の画面と同じ基準(flRatio.tsのclassifySeverity:
 *   60%以下=正常、70%以下=注意、70%超=危険)で色分けする。以前のダッシュボードは
 *   「65%超で赤」だったが、これはデザイン移行時(88b36c3)に参考実装(design-reference)の
 *   仮の式が混入したもので、意図した基準ではなかった。
 */
export type DashboardFlTone = "ok" | "warn" | "danger" | "muted";

export interface DashboardFlKpi {
  /** 表示する文字列(「55.0%」「62.0%以上」「-」) */
  text: string;
  /** 数字の色。nullは色を付けない(計算できない「-」のとき) */
  tone: DashboardFlTone | null;
  /** 「注意」バッジを出すか(未計算を含み、下限値が目安を超えているときだけ) */
  showCaution: boolean;
}

const SEVERITY_TONE: Record<Severity, DashboardFlTone> = { normal: "ok", caution: "warn", danger: "danger" };

export function buildDashboardFlKpi(flRate: number | null, hasUnsetMenu: boolean): DashboardFlKpi {
  if (flRate == null || !Number.isFinite(flRate)) return { text: "-", tone: null, showCaution: false };
  if (hasUnsetMenu) {
    return {
      text: `${flRate.toFixed(1)}%以上`,
      tone: "muted",
      showCaution: exceedsBenchmark(flRate, FL_BENCHMARK_PERCENT),
    };
  }
  const severity = classifySeverity(flRate, FL_BENCHMARK_PERCENT);
  return { text: `${flRate.toFixed(1)}%`, tone: severity ? SEVERITY_TONE[severity] : null, showCaution: false };
}

export interface DashboardFlDigestRow {
  status: "warn" | "danger";
  description: string;
}

/** 「前回から変わったこと」のFL比率の行。目安(60%)以下、または計算できないときはnull(行を出さない)。 */
export function buildDashboardFlDigestRow(flRate: number | null, hasUnsetMenu: boolean): DashboardFlDigestRow | null {
  if (flRate == null || !Number.isFinite(flRate) || !exceedsBenchmark(flRate, FL_BENCHMARK_PERCENT)) return null;
  if (hasUnsetMenu) {
    // 下限値なので「危険」(赤)の判定はしない(カードの「注意」と同じ扱い)
    return {
      status: "warn",
      description: `今月のFL比率 ${flRate.toFixed(1)}%以上(未計算のメニューを含む参考値)。人件費・食材原価の見直しを検討してください。`,
    };
  }
  return {
    status: classifySeverity(flRate, FL_BENCHMARK_PERCENT) === "danger" ? "danger" : "warn",
    description: `今月のFL比率 ${flRate.toFixed(1)}%。人件費・食材原価の見直しを検討してください。`,
  };
}
