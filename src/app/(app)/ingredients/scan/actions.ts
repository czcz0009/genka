"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { extractInvoiceItems } from "@/lib/invoiceOcr/extractInvoiceItems.ts";
import type { ExtractedInvoiceItem } from "@/lib/invoiceOcr/types.ts";

export type ScanInvoiceResult = { success: true; items: ExtractedInvoiceItem[] } | { success: false; error: string };

// Claude APIの1画像あたりの上限(10MB・base64エンコード前)に合わせる。
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * 納品書・請求書の写真をアップロードし、Claude(Vision)で品目を読み取る。
 * ここではDBへの保存は一切行わない(読み取り結果を返すだけ)。実際の
 * 食材登録・単価更新は、画面で確認・修正した後に既存のcreateIngredient/
 * updateIngredientを呼ぶ(ingredients/actions.ts、①のCSV取り込みと同じ
 * 「必ず人間が確認してから確定する」設計)。
 */
export async function scanInvoicePhoto(formData: FormData): Promise<ScanInvoiceResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "写真を選択してください" };
  }
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "画像ファイルを選択してください" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: "写真のファイルサイズが大きすぎます(10MBまで)" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractInvoiceItems(buffer);
  if (result.error) return { success: false, error: result.error };
  if (result.items.length === 0) {
    return {
      success: false,
      error: "品目を読み取れませんでした。明るい場所で、文字がはっきり写るように撮り直してみてください。",
    };
  }
  return { success: true, items: result.items };
}
