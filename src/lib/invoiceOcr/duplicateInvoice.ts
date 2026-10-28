/**
 * 同じ納品書の二度読みに気づく決まり(2026-10-28)。テストは duplicateInvoice.test.ts(D)。
 * 日付・仕入れ先(書き方をそろえたもの)・合計金額の3つが一致したら知らせる。止めはしない。
 * 記録は確定した納品書のものだけ(マイグレーション0031の invoice_scan_records。写真・明細は持たない)。
 */

/** 仕入れ先の書き方のゆれ(株式会社・(株)・㈱・有限会社・空白・全角半角・大文字小文字)をそろえる */
export function normalizeSupplier(raw: string): string {
  return raw
    .normalize("NFKC") // ㈱ → (株)、全角の英数字・括弧 → 半角
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\((株|有|合)\)/g, "")
    .replace(/[\s　]+/g, "");
}

export interface InvoiceRecord {
  invoiceDate: string; // YYYY-MM-DD
  supplierNormalized: string;
  totalAmount: number;
  createdAt: string; // 確定した日時
}

export function findPossibleDuplicate(
  current: { invoiceDate: string | null; supplier: string | null; totalAmount: number | null },
  records: InvoiceRecord[],
): InvoiceRecord | null {
  if (!current.invoiceDate || !current.supplier || current.totalAmount == null) return null;
  const supplier = normalizeSupplier(current.supplier);
  if (!supplier) return null;
  return (
    records.find((r) => r.invoiceDate === current.invoiceDate && r.supplierNormalized === supplier && Number(r.totalAmount) === current.totalAmount) ?? null
  );
}

export function duplicateNotice(hit: InvoiceRecord): string {
  const jst = new Date(new Date(hit.createdAt).getTime() + 9 * 60 * 60 * 1000);
  const when = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
  return `この納品書は読み取り済みかもしれません(${when}に確定した納品書と、日付・仕入れ先・合計金額が同じです)。同じ納品書なら、確定しなくても大丈夫です`;
}

/** 二度読みの確かめに使う記録の期間(この日数より前の納品書は確かめない) */
export const DUPLICATE_LOOKBACK_DAYS = 400;

/** now から days 日前の日付(YYYY-MM-DD) */
export function daysAgoKey(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
