import { test } from "node:test";
import assert from "node:assert/strict";
import {
  targetSize,
  prepareUpload,
  runScan,
  UPLOAD_HARD_LIMIT_BYTES,
  TOO_LARGE_MESSAGE,
  SEND_FAILED_MESSAGE,
  TIMEOUT_MESSAGE,
} from "./uploadPrep.ts";

// 納品書の写真を、ブラウザの中で縮小してから送る(2026-10-27。点検の10番、スマホの写真が1MBを超えて読み取れなかった不具合)。
// 期待値U-1〜U-6・R-1〜R-5はMahiroが確認する。

const MB = 1024 * 1024;
const file = (size: number, type = "image/jpeg", name = "photo.jpg") => ({ size, type, name });
const blob = (size: number) => ({ size, type: "image/jpeg" });

test("U-1 縮小後の大きさ: 長い辺を1568pxに合わせる(縦横比は保つ)。小さい写真は拡大しない", () => {
  assert.deepEqual(targetSize(4032, 3024), { width: 1568, height: 1176 });
  assert.deepEqual(targetSize(3024, 4032), { width: 1176, height: 1568 });
  assert.deepEqual(targetSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(targetSize(1568, 1000), { width: 1568, height: 1000 });
});

test("U-2 2.6MBのJPEG → 縮小できたので、縮小したJPEGを送る", async () => {
  const r = await prepareUpload(file(2.6 * MB), async () => blob(350 * 1024));
  assert.deepEqual(r, { ok: true, kind: "resized", size: 350 * 1024 });
});

test("U-3 縮小できない(Android等でHEICを開けない)が、元の大きさが上限以内 → 元のファイルをそのまま送る", async () => {
  const r = await prepareUpload(file(240 * 1024, "image/heic", "IMG_0001.HEIC"), async () => null);
  assert.deepEqual(r, { ok: true, kind: "original", size: 240 * 1024 });
});

test("U-4 縮小できず、元の大きさが上限を超える → 日本語の案内を出して送らない", async () => {
  const r = await prepareUpload(file(5 * MB, "image/heic", "IMG_0002.HEIC"), async () => null);
  assert.deepEqual(r, { ok: false, error: TOO_LARGE_MESSAGE });
  assert.equal(
    TOO_LARGE_MESSAGE,
    "この写真は送れませんでした。カメラの設定を「互換性優先」にするか、スクリーンショットを撮って選び直してください。",
  );
});

test("U-5 縮小の途中で例外が出ても、縮小できなかった扱いにする(上限以内なら元のまま送る)", async () => {
  const r = await prepareUpload(file(1 * MB), async () => {
    throw new Error("decode failed");
  });
  assert.deepEqual(r, { ok: true, kind: "original", size: 1 * MB });
});

test("U-6 上限は3.5MB(サーバーの受け取りの上限4MBより少し小さく)。ちょうどは送る、1バイト超えたら案内", async () => {
  assert.equal(UPLOAD_HARD_LIMIT_BYTES, 3.5 * MB);
  assert.equal((await prepareUpload(file(UPLOAD_HARD_LIMIT_BYTES), async () => null)).ok, true);
  assert.equal((await prepareUpload(file(UPLOAD_HARD_LIMIT_BYTES + 1), async () => null)).ok, false);
  // 縮小しても上限を超えた(まず起きないが)ときも送らない
  assert.equal((await prepareUpload(file(9 * MB), async () => blob(UPLOAD_HARD_LIMIT_BYTES + 1))).ok, false);
});

// ── 読み取りの呼び出し(画面が「読み取り中…」のまま止まらないこと) ──
test("R-1 読み取りに成功 → 結果を返す", async () => {
  const r = await runScan(async () => ({ success: true as const, items: [], remaining: 2 }), 1000);
  assert.deepEqual(r, { success: true, items: [], remaining: 2 });
});

test("R-2 サーバーに断られた(形式が違う等) → サーバーの日本語のメッセージをそのまま返す", async () => {
  const r = await runScan(async () => ({ success: false as const, error: "JPEG・PNG・WebP・HEICの写真を選択してください" }), 1000);
  assert.deepEqual(r, { success: false, error: "JPEG・PNG・WebP・HEICの写真を選択してください" });
});

test("R-3 送れなかった(受け取りの上限を超えた・通信が切れた等で例外) → 日本語のエラーを返す(止まらない)", async () => {
  const r = await runScan(async () => {
    throw new Error("Body exceeded 4 MB limit.");
  }, 1000);
  assert.deepEqual(r, { success: false, error: SEND_FAILED_MESSAGE });
  assert.equal(SEND_FAILED_MESSAGE, "写真を送れませんでした。通信の状態を確かめて、もう一度写真を選んでください。");
});

test("R-4 時間がかかりすぎた → 決めた時間で打ち切り、日本語のエラーを返す", async () => {
  const t0 = Date.now();
  const r = await runScan(() => new Promise(() => {}), 50);
  assert.deepEqual(r, { success: false, error: TIMEOUT_MESSAGE });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(TIMEOUT_MESSAGE, "読み取りに時間がかかりすぎたため、中断しました。少し時間をおいて、もう一度お試しください。");
});

test("R-5 結果の形がおかしい(空など) → 送れなかった扱いのエラー", async () => {
  const r = await runScan(async () => undefined as never, 1000);
  assert.deepEqual(r, { success: false, error: SEND_FAILED_MESSAGE });
});
