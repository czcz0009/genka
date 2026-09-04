/**
 * 「¥1,200」「１２００円」「12.5%」のようなセル値を数値として解釈するための
 * ゆるいパーサ。全角数字・カンマ区切り・円記号/%記号を許容する。
 */
export function parseNumericJa(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw
    .normalize("NFKC")
    .trim()
    .replace(/[,，]/g, "")
    .replace(/[¥￥円%％]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 与えられた値の集合のうち、何割が数値として解釈できるか(0〜1) */
export function numericFraction(values: string[]): number {
  const nonEmpty = values.map((v) => v?.trim()).filter((v): v is string => !!v);
  if (nonEmpty.length === 0) return 0;
  const numericCount = nonEmpty.filter((v) => parseNumericJa(v) !== null).length;
  return numericCount / nonEmpty.length;
}
