/**
 * 複数の写真(・PDFの複数ページ)が、別々の納品書だったときに気づく(2026-10-28)。テストは pageConsistency.test.ts(G-1〜G-6)。
 * AIにページごとの日付・仕入れ先を返してもらい、違うページがあれば知らせる(止めはしない)。
 * 続きのページには日付・仕入れ先が書かれていないことが多いので、読み取れない項目は「違う」とみなさない。
 */
import { normalizeSupplier } from "./duplicateInvoice.ts";
import type { InvoicePage } from "./types.ts";

export const MULTI_PAGE_HINT = "複数選ぶときは、同じ納品書の続きのページだけにしてください";

function md(date: string | null): string {
  if (!date) return "不明";
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}

export function pagesMismatchNotice(pages: InvoicePage[]): string | null {
  if (pages.length < 2) return null;
  const dates = new Set(pages.map((p) => p.date).filter((d): d is string => !!d));
  const suppliers = new Set(pages.map((p) => (p.supplier ? normalizeSupplier(p.supplier) : "")).filter((s) => s));
  if (dates.size <= 1 && suppliers.size <= 1) return null;
  const list = pages.map((p) => `${p.page}枚目: ${md(p.date)}・${p.supplier ?? "不明"}`).join("、");
  return `選んだページの中に、日付か仕入れ先が違うページがあります(${list})。別々の納品書なら、1枚ずつ読み取ってください`;
}
