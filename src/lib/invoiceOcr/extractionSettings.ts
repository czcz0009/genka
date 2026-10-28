/**
 * 納品書の読み取りでAIを呼ぶときの設定(2026-10-28)。テストは extractionSettings.test.ts。
 *
 * - temperature: 答えのばらつきの大きさ(0〜1)。指定しないと1.0(いちばんばらつく)になる。
 *   読み取りは「書いてあるとおりに写す」作業なので、0(いちばんばらつかない)にする。
 *   2026-10-28、同じ画像を3回読ませると仕入れ先が「テスト青果/青県/青泉」と変わったため。
 *   費用は変わらない(料金は送る量・返る量だけで決まる)。0でも完全に同じ答えになるとは限らない。
 */
export const OCR_MODEL = "claude-haiku-4-5-20251001";
export const OCR_TEMPERATURE = 0;
export const OCR_MAX_TOKENS = 3072; // 1ページあたり。2026-10-28: 納品書全体の情報と税率を足したぶん、少し増やした
/** AIが返す量の上限。ページ(写真の枚数・PDFのページ数)が多いほど品目が増えるので広げる(費用は実際に返った量だけ。最大8,192) */
export function ocrMaxTokens(pages: number): number {
  return Math.min(OCR_MAX_TOKENS * Math.max(1, pages), 8192);
}
