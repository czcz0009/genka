/**
 * 販売数量CSVの最終マッピングを実データに適用する。
 *
 * ①のレシピ取り込みと違い、行の粒度は自由(日別の販売数が並んでいてもよいし、
 * 期間合計が1メニュー1行でもよい)。同じメニュー名の行が複数あれば、
 * 選択した対象期間の合計として販売数量を合算する(buildSalesImportPlan)。
 */
import type { SalesFieldId } from "./salesFields.ts";
import { parseNumericJa } from "../mapping/numeric.ts";
import { normalizeDisplayName, normalizeForDedupe } from "../normalize.ts";

export type SalesFinalMapping = Partial<Record<SalesFieldId, number | null>>;

export interface SalesImportRow {
  sheetRow: number;
  menuName: string;
  quantitySold: number;
}

export interface SalesImportRowError {
  sheetRow: number;
  message: string;
}

export interface ApplySalesMappingResult {
  rows: SalesImportRow[];
  errors: SalesImportRowError[];
}

function cell(row: string[], columnIndex: number | null | undefined): string {
  if (columnIndex == null) return "";
  return (row[columnIndex] ?? "").trim();
}

export function applySalesMapping(rows: string[][], mapping: SalesFinalMapping): ApplySalesMappingResult {
  const out: SalesImportRow[] = [];
  const errors: SalesImportRowError[] = [];

  rows.forEach((row, i) => {
    const sheetRow = i + 2;
    const isBlank = row.every((c) => (c ?? "").trim() === "");
    if (isBlank) return;

    const menuNameRaw = cell(row, mapping.menuName);
    const quantityRaw = cell(row, mapping.quantitySold);

    const missing: string[] = [];
    if (!menuNameRaw) missing.push("メニュー名");
    if (!quantityRaw) missing.push("販売数量");
    if (missing.length > 0) {
      errors.push({ sheetRow, message: `${missing.join("・")} が空です` });
      return;
    }

    const quantity = parseNumericJa(quantityRaw);
    if (quantity === null || quantity < 0) {
      errors.push({ sheetRow, message: `販売数量「${quantityRaw}」が数値として読み取れません` });
      return;
    }

    out.push({ sheetRow, menuName: normalizeDisplayName(menuNameRaw), quantitySold: Math.round(quantity) });
  });

  return { rows: out, errors };
}

export interface PlannedMenuSales {
  menuName: string;
  normalizedName: string;
  totalQuantitySold: number;
  /** 何行から合算されたか(プレビュー表示用) */
  rowCount: number;
}

/** 同じメニュー名の行(日別内訳など)を対象期間の合計に集約する */
export function buildSalesImportPlan(rows: SalesImportRow[]): PlannedMenuSales[] {
  const byName = new Map<string, PlannedMenuSales>();
  for (const row of rows) {
    const key = normalizeForDedupe(row.menuName);
    const existing = byName.get(key);
    if (existing) {
      existing.totalQuantitySold += row.quantitySold;
      existing.rowCount += 1;
    } else {
      byName.set(key, {
        menuName: row.menuName,
        normalizedName: key,
        totalQuantitySold: row.quantitySold,
        rowCount: 1,
      });
    }
  }
  return Array.from(byName.values());
}
