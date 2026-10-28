/**
 * PDF・複数枚の読み取りで受け付けるもの(設計の5段目、2026-10-28)。テストは uploadSet.test.ts(F-1〜F-9)。
 * 写真は1回に5枚まで(同じ納品書の続きのページ)、PDFは1回に1つ・5ページまで。写真とPDFは混ぜない。合計3.5MBまで
 * (サーバーアクションの受け取りの上限4MBの内側)。何枚・何ページでも、読み取りの回数は1回と数える(Mahiro決定)。
 * 写真の種類の判定は imageType.ts(中身の先頭で判定)をそのまま使う。
 */
import { detectImageType, MAX_INVOICE_UPLOAD_BYTES, type InvoiceImageType } from "./imageType.ts";

export type InvoiceFileKind = InvoiceImageType | "pdf";

export const MAX_PHOTOS = 5;
export const MAX_PDF_PAGES = 5;
export const MAX_TOTAL_BYTES = MAX_INVOICE_UPLOAD_BYTES;
export const UNSUPPORTED_FILE_MESSAGE = "JPEG・PNG・WebP・HEICの写真か、PDFを選択してください";

const ALLOWED_DECLARED = new Set([
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence",
  "application/pdf",
]);
const NEUTRAL_DECLARED = new Set(["", "application/octet-stream"]);

function isPdf(head: Uint8Array): boolean {
  return head.length >= 5 && String.fromCharCode(...head.subarray(0, 5)) === "%PDF-";
}

/** 1つのファイルの確認(申告と中身の両方を見る。中身で種類を決める) */
export function checkInvoiceFile(input: { declaredType: string; size: number; head: Uint8Array }):
  | { ok: true; kind: InvoiceFileKind }
  | { ok: false; error: string } {
  if (input.size === 0) return { ok: false, error: "写真かPDFを選択してください" };
  const declared = input.declaredType.toLowerCase();
  if (!ALLOWED_DECLARED.has(declared) && !NEUTRAL_DECLARED.has(declared)) return { ok: false, error: UNSUPPORTED_FILE_MESSAGE };
  const kind: InvoiceFileKind | null = isPdf(input.head) ? "pdf" : detectImageType(input.head);
  if (!kind) return { ok: false, error: UNSUPPORTED_FILE_MESSAGE };
  if (input.size > MAX_INVOICE_UPLOAD_BYTES) {
    return {
      ok: false,
      error: kind === "pdf" ? "ファイルが大きすぎます(3.5MBまで)。PDFは、必要なページだけにしてから選んでください" : "写真のファイルサイズが大きすぎます(3.5MBまで)",
    };
  }
  return { ok: true, kind };
}

/** PDFのページ数の確認。問題なければ null。読めない(壊れている・パスワード付き)ときは null か 0 を渡す */
export function checkPdfPageCount(pages: number | null): string | null {
  if (pages == null || pages <= 0) return "PDFのページを読めませんでした。別のファイルでお試しください";
  if (pages > MAX_PDF_PAGES) return `PDFは${MAX_PDF_PAGES}ページまでです(このファイルは${pages}ページ)。必要なページだけのPDFにしてから選んでください`;
  return null;
}

/** 1回の読み取りで選んだものの組み合わせの確認。問題なければ null */
export function checkUploadSet(files: { kind: InvoiceFileKind; size: number }[]): string | null {
  if (files.length === 0) return "写真かPDFを選択してください";
  const pdfs = files.filter((f) => f.kind === "pdf").length;
  if (pdfs > 0 && pdfs < files.length) return "PDFと写真は、別々に読み取ってください";
  if (pdfs > 1) return "PDFは1回に1つずつ読み取ってください";
  if (files.length > MAX_PHOTOS) return `写真は1回に${MAX_PHOTOS}枚までです。同じ納品書の続きのページだけを選んでください`;
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return "選んだ写真の合計が大きすぎます(3.5MBまで)。枚数を減らしてください";
  return null;
}
