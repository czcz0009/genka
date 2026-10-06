/**
 * 食材の編集画面の単価欄(「単価を直接入力する」で開く。2026-10-06変更)。
 *
 * 以前は「仕入れ価格から計算する」で開いていたため、カテゴリや名前だけを変えたい時も
 * 仕入れ数量と仕入れ価格を入れ直す必要があった。
 *
 * - 未設定の食材は単価欄を空にして開く(「0」を入れない)。空のまま保存すれば未設定のまま
 * - 単価は丸めずに、保存されている値のままを入れる(String(数値)は、数値に戻すと必ず
 *   同じ値になる最短の表記になるため、往復しても値が変わらない)
 * - 単価と「設定済みかどうか」が変わらなければ、価格履歴を増やさない(isPriceChanged)
 */

export function initialDirectPriceInput(ingredient: { priceIsSet: boolean; currentPurchasePrice: number }): string {
  return ingredient.priceIsSet ? String(ingredient.currentPurchasePrice) : "";
}

export type EditedPriceResult = { ok: true; purchasePrice: number; priceIsSet: boolean } | { ok: false; error: string };

export function resolveEditedPrice(input: { wasSet: boolean; currentPurchasePrice: number; directInput: string }): EditedPriceResult {
  const trimmed = input.directInput.trim();
  if (!trimmed) {
    // 未設定の食材は、空のまま保存すれば未設定のまま(単価は今の値=参考値の0円を変えない)。
    if (!input.wasSet) return { ok: true, purchasePrice: input.currentPurchasePrice, priceIsSet: false };
    return { ok: false, error: "仕入単価を入力してください" };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "仕入単価は0以上の数値で入力してください" };
  return { ok: true, purchasePrice: n, priceIsSet: true };
}

/** 価格履歴に記録すべき変化か(単価そのもの、または設定済みかどうかが変わった)。 */
export function isPriceChanged(current: { price: number; isSet: boolean }, next: { price: number; isSet: boolean }): boolean {
  return current.price !== next.price || current.isSet !== next.isSet;
}
