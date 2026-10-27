import { test } from "node:test";
import assert from "node:assert/strict";
import { detectImageType, checkInvoiceUpload } from "./imageType.ts";

// 納品書のアップロードで受け付ける画像の種類(2026-10-26。点検の1・2番)。
// JPEG・PNG・WebP・HEICだけ。ファイルの種類の申告ではなく、中身の先頭(マジックナンバー)で判定する。
// 期待値I-1〜I-14はMahiroが確認する。

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** ISOBMFF の ftyp 箱(HEIC/AVIF)。brands = [主ブランド, 互換ブランド...] */
const ftyp = (major: string, ...compat: string[]) => bytes(u32(16 + compat.length * 4), "ftyp", major, [0, 0, 0, 0], ...compat);

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR");
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBP", "VP8 ");

test("I-1 JPEG(FF D8 FF)", () => assert.equal(detectImageType(JPEG), "jpeg"));
test("I-2 PNG(89 50 4E 47 0D 0A 1A 0A)", () => assert.equal(detectImageType(PNG), "png"));
test("I-3 WebP(RIFF....WEBP)", () => assert.equal(detectImageType(WEBP), "webp"));
test("I-4 iPhoneのHEIC(主ブランド heic)", () => assert.equal(detectImageType(ftyp("heic", "mif1", "heic")), "heic"));
test("I-5 HEIC(主ブランド mif1、互換に heic・hevc。libheifの見本と同じ形)", () =>
  assert.equal(detectImageType(ftyp("mif1", "mif1", "heic", "hevc")), "heic"));
test("I-6 HEICの連写など(heix・hevc・heis)も受け付ける", () => {
  for (const b of ["heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]) assert.equal(detectImageType(ftyp(b)), "heic", b);
});
test("I-7 AVIF(主ブランド avif、または mif1 だけ)は受け付けない", () => {
  assert.equal(detectImageType(ftyp("avif", "mif1", "avif")), null);
  assert.equal(detectImageType(ftyp("mif1", "mif1", "avif")), null);
  assert.equal(detectImageType(ftyp("mif1")), null);
});
test("I-8 SVG(文字のファイル)・GIF・BMP・PDFは受け付けない", () => {
  assert.equal(detectImageType(bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(detectImageType(bytes("<svg width='10'>")), null);
  assert.equal(detectImageType(bytes("GIF89a", [1, 0, 1, 0])), null);
  assert.equal(detectImageType(bytes("BM", [0, 0, 0, 0, 0, 0])), null);
  assert.equal(detectImageType(bytes("%PDF-1.7")), null);
});
test("I-9 RIFFでもWebPでないもの(WAVE音声)は受け付けない", () => assert.equal(detectImageType(bytes("RIFF", [0, 0, 0, 0], "WAVE")), null));
test("I-10 短すぎる・空のファイルは受け付けない", () => {
  assert.equal(detectImageType(new Uint8Array()), null);
  assert.equal(detectImageType(bytes([0xff, 0xd8])), null);
  assert.equal(detectImageType(bytes([0x89, 0x50, 0x4e, 0x47])), null);
});
test("I-11 ftypの大きさが壊れている(ファイルより大きい・8未満)ときは、読める範囲だけで判定し、例外にしない", () => {
  assert.equal(detectImageType(bytes(u32(9999), "ftyp", "heic", [0, 0, 0, 0])), "heic");
  assert.equal(detectImageType(bytes(u32(4), "ftyp", "avif")), null);
});

// ── 申告(ブラウザが付けるファイルの種類)と中身の両方を見る ──
test("I-12 申告が許可する種類で、中身も合っている → 受け付ける", () => {
  assert.deepEqual(checkInvoiceUpload({ declaredType: "image/jpeg", size: 1000, head: JPEG }), { ok: true, type: "jpeg" });
  assert.deepEqual(checkInvoiceUpload({ declaredType: "image/heic", size: 1000, head: ftyp("heic") }), { ok: true, type: "heic" });
  // Windows等でHEICの申告が空や汎用の種類になることがあるため、空・octet-streamは中身で判定する
  assert.deepEqual(checkInvoiceUpload({ declaredType: "", size: 1000, head: ftyp("heic") }), { ok: true, type: "heic" });
  assert.deepEqual(checkInvoiceUpload({ declaredType: "application/octet-stream", size: 1000, head: PNG }), { ok: true, type: "png" });
});
test("I-13 申告が許可しない種類(SVG等)なら、中身に関係なく受け付けない。申告が画像でも中身が違えば受け付けない", () => {
  const svg = checkInvoiceUpload({ declaredType: "image/svg+xml", size: 1000, head: JPEG });
  assert.equal(svg.ok, false);
  const fake = checkInvoiceUpload({ declaredType: "image/jpeg", size: 1000, head: bytes("<svg>") });
  assert.equal(fake.ok, false);
  assert.equal(!fake.ok && fake.error, "JPEG・PNG・WebP・HEICの写真を選択してください");
});
test("I-14 空のファイル、10MBを超えるファイルは受け付けない(10MBちょうどは受け付ける)", () => {
  assert.equal(checkInvoiceUpload({ declaredType: "image/jpeg", size: 0, head: JPEG }).ok, false);
  assert.equal(checkInvoiceUpload({ declaredType: "image/jpeg", size: 10 * 1024 * 1024 + 1, head: JPEG }).ok, false);
  assert.equal(checkInvoiceUpload({ declaredType: "image/jpeg", size: 10 * 1024 * 1024, head: JPEG }).ok, true);
});
