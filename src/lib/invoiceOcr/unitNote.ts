/**
 * 納品書の単位と登録済みの単位が違い、自動で換算できないときの案内(2026-10-27、設計の1段目のつなぎ)。
 * 2段目で「1個は何g」を食材ごとに覚えて自動で換算する仕組みを入れるまで、計算の例を出して、手で直してもらう。
 */
export function unitMismatchNote(invoiceUnit: string, existingUnit: string): string {
  return `納品書の単位は「${invoiceUnit}」、登録済みの単位は「${existingUnit}」です。下の「単価」の欄に、${existingUnit}あたりの単価を計算して入れてください(例: 玉ねぎ1個55円で、1個が200gなら、55÷200=0.275円/g)。1${invoiceUnit}が何${existingUnit}かを覚えて自動で計算する仕組みは、次の更新で入れます。`;
}
