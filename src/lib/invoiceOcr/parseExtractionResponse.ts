import type { ExtractedInvoiceItem } from "./types.ts";

export interface ParseExtractionResult {
  items: ExtractedInvoiceItem[];
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
    return { items: [], error: "読み取り結果を解析できませんでした。もう一度撮影し直してお試しください。" };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "読み取り結果を解析できませんでした。もう一度撮影し直してお試しください。" };
  }

  const items: ExtractedInvoiceItem[] = [];
  for (const raw of parsed) {
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
      lowConfidence: r.lowConfidence === true,
      note: toStringOrNull(r.note),
    });
  }

  return { items, error: null };
}
