/**
 * 納品書のアップロードで受け付ける画像の種類の判定(2026-10-26。点検の1・2番)。
 *
 * 受け付けるのは JPEG・PNG・WebP・HEIC だけ。ブラウザが付けるファイルの種類(申告)は書き換えられるため、
 * ファイルの中身の先頭(マジックナンバー)で、本当にその形式かを確かめる。
 * SVG(文字で書かれた画像。画像処理の部品の弱点を突く入口になりやすい)・GIF・AVIF 等は受け付けない。
 * テストは imageType.test.ts。
 */

export type InvoiceImageType = "jpeg" | "png" | "webp" | "heic";

// 受け付ける写真の大きさの上限。ブラウザで縮小できなかったときに、そのまま送ってよい上限(uploadPrep.tsの
// UPLOAD_HARD_LIMIT_BYTES)と同じ。サーバーアクションの受け取りの上限(next.config.tsの4MB)より少し小さい(2026-10-27)
export const MAX_INVOICE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
/** 判定に使う先頭のバイト数(HEICのftyp箱の互換ブランドの一覧まで読める長さ) */
export const IMAGE_HEAD_BYTES = 64;

/** HEVCで圧縮されたHEIF(=HEIC)を表すブランド。mif1・msf1 だけでは AVIF の場合もあるので、これらが要る */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);

const ascii = (b: Uint8Array, start: number, len: number) =>
  start + len <= b.length ? String.fromCharCode(...b.subarray(start, start + len)) : "";

export function detectImageType(head: Uint8Array): InvoiceImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((v, i) => head[i] === v)) return "png";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "webp";
  if (ascii(head, 4, 4) === "ftyp") {
    // ftyp箱: [大きさ4バイト]["ftyp"][主ブランド4][版4][互換ブランド4×n]。大きさが壊れていても、読める範囲だけ見る
    const declared = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
    const end = Math.min(declared >= 16 ? declared : 16, head.length);
    const brands = [ascii(head, 8, 4)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(head, i, 4));
    if (brands.some((b) => HEIC_BRANDS.has(b))) return "heic";
  }
  return null;
}

/** 申告として、そのまま受け付ける種類。空・汎用の種類(octet-stream)は、中身で判定する */
const ALLOWED_DECLARED = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const NEUTRAL_DECLARED = new Set(["", "application/octet-stream"]);

export const UNSUPPORTED_IMAGE_MESSAGE = "JPEG・PNG・WebP・HEICの写真を選択してください";

export type InvoiceUploadCheck = { ok: true; type: InvoiceImageType } | { ok: false; error: string };

export function checkInvoiceUpload(input: { declaredType: string; size: number; head: Uint8Array }): InvoiceUploadCheck {
  if (input.size === 0) return { ok: false, error: "写真を選択してください" };
  if (input.size > MAX_INVOICE_UPLOAD_BYTES) return { ok: false, error: "写真のファイルサイズが大きすぎます(3.5MBまで)" };
  const declared = input.declaredType.toLowerCase();
  if (!ALLOWED_DECLARED.has(declared) && !NEUTRAL_DECLARED.has(declared)) return { ok: false, error: UNSUPPORTED_IMAGE_MESSAGE };
  const type = detectImageType(input.head);
  if (!type) return { ok: false, error: UNSUPPORTED_IMAGE_MESSAGE };
  return { ok: true, type };
}
