/**
 * PDFのページ数を数える(納品書のPDF。設計の5段目、2026-10-28)。テストは pdfPageCount.test.ts。
 * 壊れている・パスワード付きなど、読めないときは null(画面では「PDFのページを読めませんでした」)。
 * pdfjs-dist の読み込み方は、食肉のPDF(marketPrices/livestock/parseChikusanPdf.ts)と同じ回避策を使う
 * (Turbopackが worker の動的importを書き換えて失敗するため、worker本体を静的importして登録する)。
 * ページ数を数えるだけなので、文字の表(cmaps)・フォントは使わない。
 */
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    (globalThis as { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;
    // pdfjs は渡した配列を手放す(中身を移す)ことがあるため、写しを渡す(あとでAIに送る元の中身を壊さない)
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch {
    return null;
  }
}
