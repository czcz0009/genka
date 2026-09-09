"use server";

import { monthToPeriod } from "@/lib/period/month";
import { normalizeForDedupe } from "@/lib/normalize";
import { applySalesMapping, buildSalesImportPlan, type SalesFinalMapping } from "@/lib/salesImport/applySalesMapping";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";

export interface SaveManualSalesInput {
  storeId: string;
  month: string; // "YYYY-MM"
  entries: { menuId: string; quantitySold: number }[];
}

export type SaveSalesResult =
  | { success: true; savedCount: number; skippedMenuNames: string[] }
  | { success: false; error: string };

/** 手動入力された販売数量を保存する(全メニューぶんまとめて上書き) */
export async function saveManualSales(input: SaveManualSalesInput): Promise<SaveSalesResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const { start, end } = monthToPeriod(input.month);
  const rows = input.entries
    .filter((e) => e.quantitySold >= 0)
    .map((e) => ({
      menu_id: e.menuId,
      period_start: start,
      period_end: end,
      quantity_sold: e.quantitySold,
    }));

  if (rows.length === 0) return { success: true, savedCount: 0, skippedMenuNames: [] };

  const { error } = await supabase.from("menu_sales").upsert(rows, { onConflict: "menu_id,period_start,period_end" });
  if (error) return { success: false, error: `販売数量の保存に失敗しました: ${error.message}` };

  return { success: true, savedCount: rows.length, skippedMenuNames: [] };
}

export interface SaveSalesImportInput {
  storeId: string;
  month: string;
  rows: string[][];
  mapping: SalesFinalMapping;
}

/** CSVから取り込んだ販売数量を、店舗の既存メニュー名(正規化名)と突き合わせて保存する */
export async function saveSalesImportPlan(input: SaveSalesImportInput): Promise<SaveSalesResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const { rows: parsedRows, errors } = applySalesMapping(input.rows, input.mapping);
  if (parsedRows.length === 0) {
    return {
      success: false,
      error: errors.length > 0 ? "取り込める行がありませんでした(全行エラー)" : "取り込める行がありませんでした",
    };
  }
  const plan = buildSalesImportPlan(parsedRows);

  const { data: menus, error: menusError } = await supabase
    .from("menus")
    .select("id, normalized_name")
    .eq("store_id", input.storeId);
  if (menusError) return { success: false, error: `メニューの取得に失敗しました: ${menusError.message}` };

  const menuIdByNormalizedName = new Map((menus ?? []).map((m) => [m.normalized_name, m.id]));
  const { start, end } = monthToPeriod(input.month);

  const salesRows: { menu_id: string; period_start: string; period_end: string; quantity_sold: number }[] = [];
  const skippedMenuNames: string[] = [];

  for (const planned of plan) {
    // 念のため取り込み時と同じ正規化ロジックで再突き合わせする(表記ゆれ吸収)
    const menuId = menuIdByNormalizedName.get(normalizeForDedupe(planned.menuName));
    if (!menuId) {
      skippedMenuNames.push(planned.menuName);
      continue;
    }
    salesRows.push({
      menu_id: menuId,
      period_start: start,
      period_end: end,
      quantity_sold: planned.totalQuantitySold,
    });
  }

  if (salesRows.length > 0) {
    const { error } = await supabase
      .from("menu_sales")
      .upsert(salesRows, { onConflict: "menu_id,period_start,period_end" });
    if (error) return { success: false, error: `販売数量の保存に失敗しました: ${error.message}` };
  }

  return { success: true, savedCount: salesRows.length, skippedMenuNames };
}
