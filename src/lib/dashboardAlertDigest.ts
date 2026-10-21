/**
 * ダッシュボード「前回から変わったこと」の、仕入れ値の変動の行の見出し・説明・点の色。
 *
 * 点の色は仕入れ値アラートの画面(alerts/AlertsView.tsx)に合わせる(2026-10-21):
 * 値上がりは赤(up)、値下がりは青(down)。以前は「変動幅30%以上なら赤、未満なら黄」で、
 * 値下がりでも赤になっていた。これはデザイン移行時(88b36c3)に参考実装(design-reference)の
 * 仮の式が混入したもので、意図した基準ではなかった。
 * 色だけに頼らないよう、見出しには必ず「値上がり」「値下がり」の言葉を入れる。
 */
export interface AlertDigestInput {
  ingredientName: string;
  /** 変動率(%)。値下がりはマイナス。 */
  changePercent: number;
  direction: "up" | "down";
  affectedMenuNames: string[];
}

export interface AlertDigestRow {
  tone: "up" | "down";
  title: string;
  description: string;
}

export function buildAlertDigestRow(alert: AlertDigestInput): AlertDigestRow {
  const up = alert.direction === "up";
  const verb = up ? "値上がり" : "値下がり";
  const sign = up ? "+" : "";
  const change = `変動率 ${sign}${alert.changePercent.toFixed(1)}%`;
  return {
    tone: up ? "up" : "down",
    title: `${alert.ingredientName}が${verb}しています`,
    description: alert.affectedMenuNames.length > 0 ? `${change}　影響メニュー: ${alert.affectedMenuNames.join("、")}` : change,
  };
}

/** 「前回から変わったこと」に出す件数。 */
export const ALERT_DIGEST_LIMIT = 2;

/** 変動幅(値上がり・値下がりを問わず絶対値)の大きい順に、上位ALERT_DIGEST_LIMIT件を選ぶ。 */
export function selectTopAlerts<T extends { changePercent: number }>(alerts: T[], limit = ALERT_DIGEST_LIMIT): T[] {
  return [...alerts].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, limit);
}
