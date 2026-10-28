import type { ExtractedInvoiceItem, InvoiceMeta } from "./types.ts";

export interface ParseExtractionResult {
  items: ExtractedInvoiceItem[];
  /** 納品書全体の情報。古い形(品目の配列だけ)の応答では、すべてnull */
  invoice: InvoiceMeta;
  /** JSON自体を解析できなかった場合のエラーメッセージ。成功時はnull。 */
  error: string | null;
}

/** "```json\n...\n```" のようなMarkdownコードフェンスを剥がす(付いていなければそのまま返す)。 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,¥\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const EMPTY_META: InvoiceMeta = { date: null, supplier: null, totalAmount: null, taxBasis: null };

/** 2026-10-20・2026/10/20・2026-2-3 を YYYY-MM-DD にする。実在しない日付やほかの書き方は null */
function toDateOrNull(value: unknown): string | null {
  const m = String(value ?? "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toTaxRate(value: unknown): 8 | 10 | null {
  const n = toNumberOrNull(value);
  return n === 8 || n === 10 ? n : null;
}

function parseMeta(raw: unknown): InvoiceMeta {
  if (typeof raw !== "object" || raw == null) return EMPTY_META;
  const r = raw as Record<string, unknown>;
  return {
    date: toDateOrNull(r.date),
    supplier: toStringOrNull(r.supplier),
    totalAmount: toNumberOrNull(r.totalAmount),
    taxBasis: r.taxBasis === "inclusive" || r.taxBasis === "exclusive" ? r.taxBasis : null,
  };
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/**
 * Claude Vision(納品書読み取り)の応答テキストを、構造化された候補一覧に変換する。
 *
 * 応答はJSON配列を期待するが、Markdownのコードフェンスで囲まれている場合がある
 * ため先に剥がす。要素ごとに最低限の妥当性(食材名があるか)だけ確認し、
 * 数値項目は文字列で来ても数値に変換する。個々の要素が壊れていてもそこだけ
 * 読み飛ばし、応答全体がJSONとして解析できない場合だけエラーを返す
 * (①のCSV取り込みマッピングと同じく、読み取り結果は必ず店主が画面で確認・
 * 修正してから確定する前提のため、多少ノイズがあっても候補としては出す)。
 */
export function parseExtractionResponse(rawText: string): ParseExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    return { items: [], invoice: EMPTY_META, error: "読み取り結果を解析できませんでした。もう一度撮影し直してお試しください。" };
  }

  // 新しい形 { invoice, items }(2026-10-28)と、古い形(品目の配列だけ)の両方を受け付ける
  let rawItems: unknown = parsed;
  let invoice = EMPTY_META;
  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    rawItems = o.items;
    invoice = parseMeta(o.invoice);
  }
  if (!Array.isArray(rawItems)) {
    return { items: [], invoice: EMPTY_META, error: "読み取り結果を解析できませんでした。もう一度撮影し直してお試しください。" };
  }

  const items: ExtractedInvoiceItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw == null) continue;
    const r = raw as Record<string, unknown>;
    const name = toStringOrNull(r.name);
    if (!name) continue; // 食材名すら読み取れない行は候補として出しても無意味なので除外

    items.push({
      name,
      quantity: toNumberOrNull(r.quantity),
      unit: toStringOrNull(r.unit),
      unitPrice: toNumberOrNull(r.unitPrice),
      totalAmount: toNumberOrNull(r.totalAmount),
      taxRate: toTaxRate(r.taxRate),
      lowConfidence: r.lowConfidence === true,
      note: toStringOrNull(r.note),
    });
  }

  return { items, invoice, error: null };
}
