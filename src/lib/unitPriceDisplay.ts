/**
 * 食材の単価の表示(食材一覧・メニュー編集の食材候補・追加済みの行・既存の食材を選んだ時の案内)。
 *
 * 以前は単価未設定の食材が「gあたり¥0」、材料に未設定を含む仕込み品が0円扱いの安い単価で
 * 表示されていた(2026-10-06修正)。単価未設定の食材には金額を出さず「未設定」、
 * 材料に未設定を含む仕込み品には「未設定を含む」と表示する。
 *
 * 仕込み品のpriceIsSetは、withResolvedPrepItemPrices(prepItemCost.ts)で材料をたどって
 * 解決した値を渡すこと(材料が1つでも未設定ならfalseになる)。
 */

export type UnitPriceDisplay = { kind: "price"; price: number } | { kind: "unset" } | { kind: "containsUnset" };

export function unitPriceDisplay(i: { priceIsSet: boolean; isPrepItem: boolean; currentPurchasePrice: number }): UnitPriceDisplay {
  if (i.priceIsSet) return { kind: "price", price: i.currentPurchasePrice };
  return i.isPrepItem ? { kind: "containsUnset" } : { kind: "unset" };
}

/** 金額だけの部分(「¥1.5」「未設定」「未設定を含む」)。 */
export function unitPriceText(display: UnitPriceDisplay, formatPrice: (n: number) => string): string {
  if (display.kind === "price") return formatPrice(display.price);
  return display.kind === "unset" ? "未設定" : "未設定を含む";
}

/** 「gあたり¥1.5」「gあたり 未設定」「mlあたり 未設定を含む」 */
export function unitPriceLabel(unit: string, display: UnitPriceDisplay, formatPrice: (n: number) => string): string {
  const text = unitPriceText(display, formatPrice);
  return display.kind === "price" ? `${unit}あたり${text}` : `${unit}あたり ${text}`;
}
