"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { extractInvoiceItems } from "@/lib/invoiceOcr/extractInvoiceItems.ts";
import type { ExtractedInvoiceItem } from "@/lib/invoiceOcr/types.ts";
import { OCR_MONTHLY_USE_LIMIT, ocrGateMessage, remainingOcrUses } from "@/lib/invoiceOcr/usageLimit.ts";
import { beginOcrAttempt, cancelOcrAttempt, completeOcrSuccess } from "@/lib/invoiceOcr/ocrGate.ts";
import { checkInvoiceUpload, IMAGE_HEAD_BYTES } from "@/lib/invoiceOcr/imageType.ts";

export type ScanInvoiceResult = { success: true; items: ExtractedInvoiceItem[]; remaining: number } | { success: false; error: string };

/**
 * 納品書・請求書の写真をアップロードし、Claude(Vision)で品目を読み取る。
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

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "写真を選択してください" };
  }
  // 受け付けるのは JPEG・PNG・WebP・HEIC だけ。申告(file.type)ではなく、中身の先頭で確かめる(SVG等を通さない)。
  // 回数の上限を使う前に確かめるので、受け付けないファイルでは試行回数は減らない。
  const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
  const checked = checkInvoiceUpload({ declaredType: file.type, size: file.size, head });
  if (!checked.ok) return { success: false, error: checked.error };

  const gate = await beginOcrAttempt(ctx.supabase);
  if (!gate.ok) return { success: false, error: ocrGateMessage(gate.reason) };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractInvoiceItems(buffer, checked.type);
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
  return { success: true, items: result.items, remaining: remainingOcrUses(used ?? OCR_MONTHLY_USE_LIMIT, OCR_MONTHLY_USE_LIMIT) };
}
