/**
 * 確認の画面で、行を「要確認」と「いつもどおり」に分ける決まり(設計の3段目、2026-10-28)。テストは reviewRows.test.ts(Y)。
 * 前回からの変化の基準は、アプリの仕入れ値アラートと同じ ±10%(ちょうど10%も要確認。detectPriceChanges.ts)。
 */
import { DEFAULT_CHANGE_THRESHOLD_PERCENT } from "../marketPrices/detectPriceChanges.ts";

export type ReviewReason =
  | "new_item"
  | "needs_conversion"
  | "low_confidence"
  | "amount_mismatch"
  | "computed_from_amount"
  | "no_previous_price"
  | "price_change";

/** 前回からの変化(%)。計算機の誤差(−9.999…%)を消すため、小数第4位で丸める */
export function priceChangePercent(previous: number, next: number): number {
  return Math.round(((next - previous) / previous) * 100 * 10000) / 10000;
}

export function reviewReasons(r: {
  isNew: boolean;
  needsConversion: boolean;
  lowConfidence: boolean;
  amountMismatch: boolean;
  computedFromAmount: boolean;
  /** 前回の単価(食材の単位あたり)。未設定なら null */
  previousPrice: number | null;
  /** 今回の単価(食材の単位あたり)。換算がまだ等で出せなければ null */
  newPrice: number | null;
}): ReviewReason[] {
  const out: ReviewReason[] = [];
  if (r.isNew) out.push("new_item");
  if (r.needsConversion) out.push("needs_conversion");
  if (r.lowConfidence) out.push("low_confidence");
  if (r.amountMismatch) out.push("amount_mismatch");
  if (r.computedFromAmount) out.push("computed_from_amount");
  if (!r.isNew) {
    const hasPrevious = r.previousPrice != null && r.previousPrice > 0;
    if (!hasPrevious) out.push("no_previous_price");
    else if (r.newPrice != null && Math.abs(priceChangePercent(r.previousPrice!, r.newPrice)) >= DEFAULT_CHANGE_THRESHOLD_PERCENT) {
      out.push("price_change");
    }
  }
  return out;
}

function formatPercent(p: number): string {
  const v = Math.round(Math.abs(p) * 10) / 10;
  return `${p < 0 ? "−" : "+"}${v}%`;
}

export function reviewReasonLabel(
  reason: ReviewReason,
  ctx: { invoiceUnit?: string; ingredientUnit?: string; note?: string | null; previousPrice?: number | null; newPrice?: number | null },
): string {
  switch (reason) {
    case "new_item":
      return "新しい品目です";
    case "needs_conversion":
      return `1${ctx.invoiceUnit ?? ""}が何${ctx.ingredientUnit ?? ""}かを入れてください`;
    case "low_confidence":
      return ctx.note ? `読み取りに自信がありません(${ctx.note})` : "読み取りに自信がありません";
    case "amount_mismatch":
      return "数量×単価が、金額と合いません。読み取りの誤りかもしれません";
    case "computed_from_amount":
      return "単価の記載が無いため、金額÷数量で計算しました";
    case "no_previous_price":
      return "前回の単価が未設定です";
    case "price_change": {
      const u = ctx.ingredientUnit ?? "";
      const prev = ctx.previousPrice ?? 0;
      const next = ctx.newPrice ?? 0;
      return `前回 ${prev}円/${u} → 今回 ${next}円/${u}(${formatPercent(priceChangePercent(prev, next))})`;
    }
  }
}

export interface BlockerRow {
  name: string;
  included: boolean;
  needsConversion: boolean;
  priceBlank: boolean;
  conversionError: string | null;
  /** 換算に「目安」が入ったままで、店主がまだ確かめていない */
  estimateUnconfirmed?: boolean;
}

/** 確定を押せない理由(空なら確定できる)。外した行は見ない */
export function confirmBlockers(s: { needsTaxChoice: boolean; rows: BlockerRow[] }): string[] {
  const out: string[] = [];
  if (s.needsTaxChoice) out.push("この納品書の金額が税込か税抜かを、上で選んでください");
  for (const r of s.rows) {
    if (!r.included) continue;
    if (r.conversionError) out.push(`${r.name}: ${r.conversionError}`);
    else if (r.estimateUnconfirmed) out.push(`${r.name}: 換算の目安を確かめて、「この値で正しい」に印を付けてください`);
    else if (r.needsConversion) out.push(`${r.name}: 換算を入れるか、この行を外してください`);
    else if (r.priceBlank) out.push(`${r.name}: 単価を入れるか、この行を外してください`);
  }
  return out;
}
