"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { extractInvoiceItems, type InvoiceSource } from "@/lib/invoiceOcr/extractInvoiceItems.ts";
import type { ExtractedInvoiceItem, InvoiceMeta, InvoicePage } from "@/lib/invoiceOcr/types.ts";
import type { ConversionRowToSave } from "@/lib/invoiceOcr/conversionMemory.ts";
import { CONVERSION_MAX } from "@/lib/invoiceOcr/unitPrice.ts";
import { normalizeSupplier } from "@/lib/invoiceOcr/duplicateInvoice.ts";
import { OCR_MONTHLY_USE_LIMIT, ocrGateMessage, remainingOcrUses } from "@/lib/invoiceOcr/usageLimit.ts";
import { beginOcrAttempt, cancelOcrAttempt, completeOcrSuccess } from "@/lib/invoiceOcr/ocrGate.ts";
import { IMAGE_HEAD_BYTES } from "@/lib/invoiceOcr/imageType.ts";
import { checkInvoiceFile, checkPdfPageCount, checkUploadSet, MAX_PHOTOS, type InvoiceFileKind } from "@/lib/invoiceOcr/uploadSet.ts";
import { countPdfPages } from "@/lib/invoiceOcr/pdfPageCount.ts";
import type { AliasRowToSave } from "@/lib/invoiceOcr/nameMatching.ts";
import { MAX_ALIAS_LENGTH } from "@/lib/invoiceOcr/nameMatching.ts";

export type ScanInvoiceResult =
  | { success: true; items: ExtractedInvoiceItem[]; invoice: InvoiceMeta; pages: InvoicePage[]; remaining: number }
  | { success: false; error: string };

/**
 * 納品書・請求書の写真(1〜5枚)かPDF(1つ・5ページまで)をアップロードし、Claudeで品目を読み取る(PDF・複数枚は2026-10-28)。
 * ここではDBへの保存は一切行わない(読み取り結果を返すだけ)。実際の
 * 食材登録・単価更新は、画面で確認・修正した後に既存のcreateIngredient/
 * updateIngredientを呼ぶ(ingredients/actions.ts、①のCSV取り込みと同じ
 * 「必ず人間が確認してから確定する」設計)。
 *
 * 回数の数え方(2026-10-27。マイグレーション0029・usageLimit.ts): 月の成功50回・月の試行100回・1日の試行20回・
 * アプリ全体の1日の試行200回。AIを呼ぶ前に受付票をもらい(試行を1回数える)、成功したら成功を数える。
 * AI側の都合(残高不足など)で読めなかったときは、試行を取り消し(店主の回数を減らさない)、記録を残す。
 */
export async function scanInvoicePhoto(formData: FormData): Promise<ScanInvoiceResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };

  // 写真(1〜5枚)か、PDF(1つ・5ページまで)。種類は申告ではなく中身の先頭で確かめる(uploadSet.ts)。
  // 回数の上限を使う前に確かめるので、受け付けないファイルでは試行回数は減らない。何枚・何ページでも1回と数える(Mahiro決定、2026-10-28)
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const sources: InvoiceSource[] = [];
  const kinds: { kind: InvoiceFileKind; size: number }[] = [];
  for (const file of files.slice(0, MAX_PHOTOS + 1)) {
    const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
    const checked = checkInvoiceFile({ declaredType: file.type, size: file.size, head });
    if (!checked.ok) return { success: false, error: checked.error };
    kinds.push({ kind: checked.kind, size: file.size });
    const buffer = Buffer.from(await file.arrayBuffer());
    sources.push(checked.kind === "pdf" ? { kind: "pdf", buffer } : { kind: "image", type: checked.kind, buffer });
  }
  // 6つ目まで確かめれば「5枚まで」の判定ができる(それ以上は読まない)
  const setError = checkUploadSet(kinds);
  if (setError) return { success: false, error: setError };
  let pageCount = sources.length;
  if (sources[0].kind === "pdf") {
    const pages = await countPdfPages(new Uint8Array(sources[0].buffer));
    const pageError = checkPdfPageCount(pages);
    if (pageError) return { success: false, error: pageError };
    pageCount = pages!;
  }

  const gate = await beginOcrAttempt(ctx.supabase);
  if (!gate.ok) return { success: false, error: ocrGateMessage(gate.reason) };

  const result = await extractInvoiceItems(sources, pageCount);
  if (result.unavailable) {
    await cancelOcrAttempt(ctx.supabase, gate.reservation, result.unavailable);
    return { success: false, error: ocrGateMessage("unavailable") };
  }
  if (result.error) return { success: false, error: result.error };
  if (result.items.length === 0) {
    return {
      success: false,
      error: "品目を読み取れませんでした。明るい場所で、文字がはっきり写るように撮り直してみてください。",
    };
  }

  // 読み取りに成功したときだけ「成功回数」を数える
  const used = await completeOcrSuccess(ctx.supabase, gate.reservation);
  const invoice: InvoiceMeta = result.invoice ?? { date: null, supplier: null, totalAmount: null, taxBasis: null };
  return { success: true, items: result.items, invoice, pages: result.pages ?? [], remaining: remainingOcrUses(used ?? OCR_MONTHLY_USE_LIMIT, OCR_MONTHLY_USE_LIMIT) };
}

/**
 * 換算を覚える(マイグレーション0031の ingredient_unit_conversions。2026-10-28)。
 * 何を保存するかは画面側の conversionToSave(conversionMemory.ts)で決めている(確かめていない目安は渡ってこない)。
 * ここでは値の範囲だけ確かめる。どの店の食材かはDBの決まり(RLS)で確かめる(他の店の食材なら断られる)。
 */
export async function rememberConversions(rows: ConversionRowToSave[]): Promise<{ success: true; saved: number } | { success: false; error: string }> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  if (!Array.isArray(rows) || rows.length === 0) return { success: true, saved: 0 };
  if (rows.length > 100) return { success: false, error: "一度に覚えられる換算は100件までです" };
  for (const r of rows) {
    const unitOk = typeof r.purchase_unit === "string" && r.purchase_unit.trim().length >= 1 && r.purchase_unit.trim().length <= 20;
    const amountUnitOk = typeof r.amount_unit === "string" && r.amount_unit.trim().length >= 1 && r.amount_unit.trim().length <= 20;
    const amountOk = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0 && r.amount <= CONVERSION_MAX;
    if (!unitOk || !amountUnitOk || !amountOk || (r.source !== "owner" && r.source !== "estimate") || typeof r.ingredient_id !== "string") {
      return { success: false, error: "換算の値が正しくありません" };
    }
  }
  const { error } = await ctx.supabase.from("ingredient_unit_conversions").upsert(
    rows.map((r) => ({ ingredient_id: r.ingredient_id, purchase_unit: r.purchase_unit.trim(), amount: r.amount, amount_unit: r.amount_unit.trim(), source: r.source })),
    { onConflict: "ingredient_id,normalized_unit" },
  );
  if (error) {
    console.error("rememberConversions failed", error.code);
    return { success: false, error: "換算を覚えられませんでした(単価の更新は済んでいます)。次の納品書で、もう一度入れてください。" };
  }
  return { success: true, saved: rows.length };
}

/**
 * 確定した納品書の、日付・仕入れ先(書き方をそろえたもの)・合計金額だけを記録する(同じ納品書の二度読みに気づくため。0031の invoice_scan_records)。
 * 写真・明細は残さない。記録に失敗しても、単価の更新は済んでいるので、画面には出さない。
 */
export async function recordInvoiceScan(input: { storeId: string; invoiceDate: string; supplier: string; totalAmount: number }): Promise<{ success: boolean }> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false };
  const supplier = normalizeSupplier(String(input.supplier ?? "")).slice(0, 100);
  const dateOk = typeof input.invoiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate);
  const totalOk = typeof input.totalAmount === "number" && Number.isFinite(input.totalAmount) && input.totalAmount >= 0 && input.totalAmount < 100_000_000;
  if (!supplier || !dateOk || !totalOk) return { success: false };
  const { error } = await ctx.supabase
    .from("invoice_scan_records")
    .insert({ store_id: input.storeId, invoice_date: input.invoiceDate, supplier_normalized: supplier, total_amount: input.totalAmount });
  if (error) console.error("recordInvoiceScan failed", error.code);
  return { success: !error };
}

/**
 * 名前の対応づけを覚える(マイグレーション0032の ingredient_name_aliases。2026-10-28)。
 * 何を覚えるかは画面側の aliasToSave(nameMatching.ts)で決めている(店主が選び直した行だけ)。
 * ここでは長さだけ確かめる。店舗と食材の食い違い・他の店の食材は、DBの決まり(RLS)が断る。
 */
export async function rememberAliases(storeId: string, rows: AliasRowToSave[]): Promise<{ success: true; saved: number } | { success: false; error: string }> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  if (!Array.isArray(rows) || rows.length === 0) return { success: true, saved: 0 };
  if (rows.length > 100) return { success: false, error: "一度に覚えられる名前は100件までです" };
  for (const r of rows) {
    const ok =
      typeof r.ingredient_id === "string" &&
      typeof r.alias === "string" && r.alias.trim().length >= 1 && r.alias.trim().length <= MAX_ALIAS_LENGTH &&
      typeof r.normalized_alias === "string" && r.normalized_alias.length >= 1 && r.normalized_alias.length <= MAX_ALIAS_LENGTH;
    if (!ok) return { success: false, error: "覚える名前が正しくありません" };
  }
  const { error } = await ctx.supabase.from("ingredient_name_aliases").upsert(
    rows.map((r) => ({ store_id: storeId, ingredient_id: r.ingredient_id, alias: r.alias.trim(), normalized_alias: r.normalized_alias })),
    { onConflict: "store_id,normalized_alias" },
  );
  if (error) {
    console.error("rememberAliases failed", error.code);
    return { success: false, error: "名前の対応を覚えられませんでした(単価の更新は済んでいます)。" };
  }
  return { success: true, saved: rows.length };
}
