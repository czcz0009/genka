/**
 * 畜産物月報告PDFは1ファイルの中に複数月分の月次サマリー行(例:「7年7月」〜「8年8月」)を
 * 含んでいる。そのため、前月比較に必要な「今回分」「前回分」の両方を、
 * 別ファイル(前回の取得結果)を持ち出さなくても同じPDF1枚から取り出せる
 * (無ければ呼び出し側で前回保存分にフォールバックしてもよい)。
 *
 * 「今回分」= レポートに含まれる最新の月次サマリー行(通常はレポートのタイトル月そのもの)
 * 「前回分」= その1つ前の月次サマリー行
 */
import type { ChikusanRow } from "./parseChikusanPdf.ts";
import { CHIKUSAN_COLUMNS } from "./chikusanColumns.ts";
import type { SyuyoItem } from "../parseSyuyoCsv.ts";
import { reiwaToGregorianYear } from "../../reiwa.ts";

export interface ChikusanPeriod {
  year: number;
  month: number;
}

export interface MonthlyComparisonPair {
  current: { period: ChikusanPeriod; row: ChikusanRow };
  previous: { period: ChikusanPeriod; row: ChikusanRow };
}

/** "8年 7月" のような月次サマリー行ラベルを西暦の年月に変換する(令和→西暦変換込み) */
export function parseMonthlyRowLabel(label: string): ChikusanPeriod | null {
  // 例: "8年 7月" (year=8 は令和8年)
  const m = label.replace(/\s+/g, "").match(/^(\d+)年(\d+)月$/);
  if (!m) return null;
  return { year: reiwaToGregorianYear(Number(m[1])), month: Number(m[2]) };
}

/** 最新の月次サマリー行とその1つ前の行を取り出す。月次行が2件未満なら null。 */
export function selectMonthlyComparisonPair(rows: ChikusanRow[]): MonthlyComparisonPair | null {
  const monthlyRows = rows.filter((r) => r.kind === "monthly");
  if (monthlyRows.length < 2) return null;

  const currentRow = monthlyRows[monthlyRows.length - 1];
  const previousRow = monthlyRows[monthlyRows.length - 2];
  const currentPeriod = parseMonthlyRowLabel(currentRow.rowLabel);
  const previousPeriod = parseMonthlyRowLabel(previousRow.rowLabel);
  if (!currentPeriod || !previousPeriod) return null;

  return {
    current: { period: currentPeriod, row: currentRow },
    previous: { period: previousPeriod, row: previousRow },
  };
}

/**
 * ChikusanRowの価格を、detectPriceChanges/generateAlerts がそのまま扱える
 * SyuyoItem[]の形に変換する(①③で使っている「品目コード・品目名・卸売価格」
 * という汎用の形に合わせることで、青果物用に書いたロジックをそのまま流用する)。
 */
export function toMarketItems(row: ChikusanRow): SyuyoItem[] {
  return CHIKUSAN_COLUMNS.filter((col) => col.itemCode != null).map((col) => ({
    itemCode: col.itemCode as string,
    itemName: col.label,
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg: row.prices[col.itemCode!] ?? null,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
  }));
}
