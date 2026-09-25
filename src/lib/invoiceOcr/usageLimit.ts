/** β期間中の、1ユーザーあたりの納品書OCR利用回数の上限(累計)。 */
export const OCR_USAGE_LIMIT = 3;

/** 残り回数(0未満にはならない) */
export function remainingOcrUses(usedCount: number, limit: number = OCR_USAGE_LIMIT): number {
  return Math.max(0, limit - usedCount);
}

/**
 * AIを呼んだ試行回数の上限(累計)。読み取りに失敗する画像を繰り返し送って
 * 利用料をかけ続けられないようにするための安全弁。成功回数の上限より大きくする。
 */
export const OCR_ATTEMPT_LIMIT = 10;
