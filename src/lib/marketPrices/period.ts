/**
 * 農水省「青果物卸売市場調査(旬別結果)」の公表周期(旬=10日前後の期間)を扱う。
 *
 * 旬番号: 1=上旬(1〜10日) 2=中旬(11〜20日) 3=下旬(21日〜末日)
 */
export interface Period {
  year: number;
  month: number; // 1-12
  third: 1 | 2 | 3;
}

export function formatPeriodLabel(p: Period): string {
  const thirdLabel = p.third === 1 ? "上旬" : p.third === 2 ? "中旬" : "下旬";
  return `${p.year}年${p.month}月${thirdLabel}`;
}

/** 1つ前の旬を返す(月またぎ・年またぎを考慮) */
export function previousPeriod(p: Period): Period {
  if (p.third > 1) {
    return { year: p.year, month: p.month, third: (p.third - 1) as 1 | 2 };
  }
  if (p.month > 1) {
    return { year: p.year, month: p.month - 1, third: 3 };
  }
  return { year: p.year - 1, month: 12, third: 3 };
}

/** 1つ後の旬を返す(previousPeriodの逆。「今どの旬まで来ているか」を進めるのに使う) */
export function nextPeriod(p: Period): Period {
  if (p.third < 3) {
    return { year: p.year, month: p.month, third: (p.third + 1) as 2 | 3 };
  }
  if (p.month < 12) {
    return { year: p.year, month: p.month + 1, third: 1 };
  }
  return { year: p.year + 1, month: 1, third: 1 };
}

/** 指定日が属する旬を返す(1〜10日=上旬、11〜20日=中旬、21日〜月末=下旬) */
export function periodForDate(date: Date): Period {
  const day = date.getDate();
  const third: 1 | 2 | 3 = day <= 10 ? 1 : day <= 20 ? 2 : 3;
  return { year: date.getFullYear(), month: date.getMonth() + 1, third };
}

/**
 * 「主要卸売市場計(_syuyo)」CSVのURLを組み立てる。
 * 都市別(_tosi)・市場別(_sijyo)は今回のスコープ外のため対応しない。
 */
export function buildSyuyoCsvUrl(p: Period): string {
  const yy = String(p.year % 100).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  return `https://www.maff.go.jp/j/tokei/syohi/shunbetu/${p.year}/csv/${yy}${mm}${p.third}h_syuyo.csv`;
}
