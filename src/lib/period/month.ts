/**
 * ③(利益貢献度ランキング)・FL比率/FLR比率は、店主の実感に合わせて
 * 「月」単位で扱う(menu_sales/store_fixed_costsのDB上は任意の日付範囲を
 * 持てるが、UIからは常に暦月の範囲を作る)。
 */

/** "YYYY-MM" -> その月の初日・末日(ISO日付文字列) */
export function monthToPeriod(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate(); // 翌月0日 = 当月末日
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function currentMonthString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonthString(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 2, 1)); // m は1始まりなので -2 で前月の1日
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

/** 直近N ヶ月分(古い→新しい順)の "YYYY-MM" 一覧。デフォルトは指定月を含む直近6ヶ月。 */
export function recentMonths(endMonth: string, count = 6): string[] {
  const months: string[] = [endMonth];
  let cursor = endMonth;
  for (let i = 1; i < count; i++) {
    cursor = previousMonthString(cursor);
    months.unshift(cursor);
  }
  return months;
}
