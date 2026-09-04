/**
 * 和暦(令和)⇔西暦の変換。農水省の統計は和暦表記が多く、
 * 青果物旬別調査(タイトル行)・畜産物月報告(行ラベル)の両方で使う。
 */
const REIWA_EPOCH_OFFSET = 2018; // 令和1年 = 2019年 なので 西暦 = 2018 + 令和年

export function reiwaToGregorianYear(reiwaYear: number): number {
  return REIWA_EPOCH_OFFSET + reiwaYear;
}
