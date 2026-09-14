/**
 * 「仕入単価は税込・税抜のどちらで入力しているか」の店舗設定。
 * クライアントコンポーネント(食材入力欄のラベル表示)からも使うため、
 * server-only化されているstore.tsとは別のファイルに置いている。
 *
 * 売価は総額表示のルールにより常に税込として扱うため、こちらの選択肢の対象外
 * (売価側は断定できる=設定不要、仕入単価側だけ店舗ごとに選んでもらう)。
 * この設定はラベル表示だけに使い、原価率などの計算式自体は変更しない。
 */
export type IngredientPriceTaxMode = "inclusive" | "exclusive";

export function ingredientPriceTaxModeLabel(mode: IngredientPriceTaxMode): string {
  return mode === "inclusive" ? "税込" : "税抜";
}
