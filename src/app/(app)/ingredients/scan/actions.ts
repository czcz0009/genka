"use server";

import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { extractInvoiceItems } from "@/lib/invoiceOcr/extractInvoiceItems.ts";
import type { ExtractedInvoiceItem } from "@/lib/invoiceOcr/types.ts";
import { OCR_ATTEMPT_LIMIT, OCR_USAGE_LIMIT, remainingOcrUses } from "@/lib/invoiceOcr/usageLimit.ts";
import { checkInvoiceUpload, IMAGE_HEAD_BYTES } from "@/lib/invoiceOcr/imageType.ts";

export type ScanInvoiceResult = { success: true; items: ExtractedInvoiceItem[]; remaining: number } | { success: false; error: string };

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
  // 受け付けるのは JPEG・PNG・WebP・HEIC だけ。申告(file.type)ではなく、中身の先頭で確かめる(SVG等を通さない)。
  // 回数の上限を使う前に確かめるので、受け付けないファイルでは試行回数は減らない。
  const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
  const checked = checkInvoiceUpload({ declaredType: file.type, size: file.size, head });
  if (!checked.ok) return { success: false, error: checked.error };

  // β期間中の利用回数の上限チェック。AIを呼ぶ前に、DB側で排他制御しながら
  // 「成功回数」と「試行回数」の両方を確認し、試行回数を1つ消費する。
  const { data: gate, error: gateError } = await ctx.supabase.rpc("begin_ocr_attempt", {
    p_use_limit: OCR_USAGE_LIMIT,
    p_attempt_limit: OCR_ATTEMPT_LIMIT,
  });
  if (gateError) return { success: false, error: "利用回数を確認できませんでした。時間をおいて再度お試しください。" };
  if (gate === "use_limit") return { success: false, error: "β版期間中の読み取り回数の上限に達しました。" };
  if (gate === "attempt_limit") {
    return { success: false, error: "β版期間中の読み取りの試行回数の上限に達しました。" };
  }
  if (gate !== "ok") return { success: false, error: "利用回数を確認できませんでした。時間をおいて再度お試しください。" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractInvoiceItems(buffer, checked.type);
  if (result.error) return { success: false, error: result.error };
  if (result.items.length === 0) {
    return {
      success: false,
      error: "品目を読み取れませんでした。明るい場所で、文字がはっきり写るように撮り直してみてください。",
    };
  }

  // 読み取りに成功したときだけ「成功回数」を消費する
  const { data: newCount } = await ctx.supabase.rpc("complete_ocr_success");
  const used = typeof newCount === "number" ? newCount : OCR_USAGE_LIMIT;
  return { success: true, items: result.items, remaining: remainingOcrUses(used) };
}
