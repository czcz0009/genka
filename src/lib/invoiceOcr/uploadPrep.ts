/**
 * 納品書の写真を、ブラウザの中で縮小してから送る(2026-10-27。点検の10番)。
 *
 * 背景: サーバーアクションが受け取れる大きさには上限があり(初期設定1MB)、スマホの写真(1.5〜4MB)は
 * 「Body exceeded 1 MB limit」で断られ、画面が「読み取り中…」のまま止まっていた。
 * 対策:
 * - ブラウザの中で、長い辺をサーバー側と同じ1568pxに縮小し、JPEGにしてから送る(数百KBになる)。
 *   JPEGにし直すので、写真の位置情報などの付加情報も送られない。
 * - ブラウザが開けない形式(Android等のHEIC)で縮小できないときは、元の大きさが上限(3.5MB)以内なら
 *   そのまま送り(サーバー側で読める)、超えるなら日本語の案内を出して送らない。
 * - 予備として、サーバーの受け取りの上限を4MBに広げている(next.config.ts)。
 * - 送れなかった・断られた・時間がかかりすぎたときは、必ず日本語のエラーを返す(画面を止めない)。
 * 縮小の判断と、読み取りの呼び出しの扱いは、ここにまとめてテストする(uploadPrep.test.ts)。
 * 実際の縮小(画像を開いて描き直す)はブラウザでしか動かないので resizeInBrowser に分けている。
 */

export const TARGET_LONG_EDGE = 1568; // サーバー側の縮小(extractInvoiceItems.ts)と同じ
export const JPEG_QUALITY = 0.85;
/** 縮小できなかったときに、そのまま送ってよい大きさの上限。サーバーの受け取りの上限(4MB)より少し小さくする */
export const UPLOAD_HARD_LIMIT_BYTES = 3.5 * 1024 * 1024;
/** 読み取りを待つ時間の上限(AIの読み取りは通常10〜30秒) */
export const SCAN_TIMEOUT_MS = 120_000;

export const TOO_LARGE_MESSAGE =
  "この写真は送れませんでした。カメラの設定を「互換性優先」にするか、スクリーンショットを撮って選び直してください。";
export const SEND_FAILED_MESSAGE = "写真を送れませんでした。通信の状態を確かめて、もう一度写真を選んでください。";
export const TIMEOUT_MESSAGE = "読み取りに時間がかかりすぎたため、中断しました。少し時間をおいて、もう一度お試しください。";

/** 長い辺を TARGET_LONG_EDGE に合わせた大きさ(拡大はしない) */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

type SizedFile = { size: number; type: string; name: string };
type SizedBlob = { size: number; type: string };

export type PrepareResult = { ok: true; kind: "resized" | "original"; size: number } | { ok: false; error: string };

/**
 * 送るものを決める。resize は縮小したJPEG(できなければnull)を返す関数(ブラウザでは resizeInBrowser)。
 * 送る中身(Blob)は呼び出し側が持つ。ここでは「どれを送るか」だけを決める。
 */
export async function prepareUpload(original: SizedFile, resize: () => Promise<SizedBlob | null>): Promise<PrepareResult> {
  let resized: SizedBlob | null = null;
  try {
    resized = await resize();
  } catch {
    resized = null; // 縮小の途中の失敗は「縮小できなかった」扱い
  }
  if (resized) {
    return resized.size <= UPLOAD_HARD_LIMIT_BYTES ? { ok: true, kind: "resized", size: resized.size } : { ok: false, error: TOO_LARGE_MESSAGE };
  }
  return original.size <= UPLOAD_HARD_LIMIT_BYTES ? { ok: true, kind: "original", size: original.size } : { ok: false, error: TOO_LARGE_MESSAGE };
}

type ScanResultLike<T> = ({ success: true } & T) | { success: false; error: string };

/**
 * 読み取り(サーバーアクション)を呼ぶ。例外・時間切れ・おかしな結果は、日本語のエラーにして返す。
 * 時間切れのときも、サーバー側の処理は止められないが、画面はすぐに選び直せる状態に戻す。
 */
export async function runScan<T extends object>(send: () => Promise<ScanResultLike<T>>, timeoutMs: number = SCAN_TIMEOUT_MS): Promise<ScanResultLike<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([send(), timeout]);
    if (result === "timeout") return { success: false, error: TIMEOUT_MESSAGE };
    if (!result || typeof result !== "object" || typeof (result as { success?: unknown }).success !== "boolean") {
      return { success: false, error: SEND_FAILED_MESSAGE };
    }
    return result;
  } catch {
    return { success: false, error: SEND_FAILED_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ブラウザの中で写真を縮小してJPEGにする。開けない形式(HEICを開けないブラウザ等)なら null。
 * 写真の向き(Exif)は反映する。ブラウザ専用(テストは画面の確認で行う)。
 */
export async function resizeInBrowser(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height);
    if (width === 0 || height === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; // 透明な部分(PNG等)は白にする
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY));
  } finally {
    bitmap.close();
  }
}
