/**
 * 納品書の単価を、食材の単位・店の税の設定にそろえる計算(設計の2・3段目、2026-10-28。docs/design-invoice-flow.md)。
 * テストは unitPrice.test.ts(K・L・Z。期待値はMahiroが検算済み)。
 *
 * 順番: ①1行の単価(記載が無ければ 金額÷数量) → ②税込・税抜を店の設定にそろえる → ③食材の単位に換算 → ④小数第4位で丸める。
 * 丸めは最後にだけ行う(途中で丸めると、0.297 のような小さい単価がずれるため)。
 */
import type { IngredientPriceTaxMode } from "../taxMode.ts";
import { convertUnitPrice, isSameUnit, measureUnitInfo } from "./convertUnitPrice.ts";

/** 換算: 仕入れの単位1つが、amount unit にあたる(例: 1個 = 200 g、1箱 = 10 kg) */
export interface Conversion {
  amount: number;
  unit: string;
}

export type InvoiceTaxBasis = "inclusive" | "exclusive";

/** 単価は小数第4位まで(第5位を四捨五入) */
export function roundUnitPrice(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * 1行の単価。単価の記載が無ければ 金額÷数量 で計算する。
 * 単価と金額の両方があり、数量×単価と金額の差が1円以上なら「合わない」(読み取りの誤りの疑い)。
 */
export function lineUnitPrice(i: { quantity: number | null; unitPrice: number | null; totalAmount: number | null }): {
  price: number | null;
  computedFromAmount: boolean;
  amountMismatch: boolean;
} {
  if (i.unitPrice != null) {
    const mismatch = i.quantity != null && i.quantity > 0 && i.totalAmount != null && Math.abs(i.quantity * i.unitPrice - i.totalAmount) >= 1;
    return { price: i.unitPrice, computedFromAmount: false, amountMismatch: mismatch };
  }
  if (i.totalAmount != null && i.quantity != null && i.quantity > 0) {
    return { price: roundUnitPrice(i.totalAmount / i.quantity), computedFromAmount: true, amountMismatch: false };
  }
  return { price: null, computedFromAmount: false, amountMismatch: false };
}

/**
 * 納品書の税込・税抜を、店の設定(仕入単価を税込・税抜のどちらで入れているか)にそろえる。
 * 納品書のほうが分からなければ null(店主に選んでもらう)。
 */
export function adjustForTax(
  price: number,
  invoiceBasis: InvoiceTaxBasis | null,
  storeMode: IngredientPriceTaxMode,
  ratePercent: number,
): number | null {
  if (invoiceBasis == null) return null;
  if (invoiceBasis === storeMode) return price;
  const factor = 1 + ratePercent / 100;
  return roundUnitPrice(invoiceBasis === "exclusive" ? price * factor : price / factor);
}

/** 換算の量を、食材の単位に直す(1箱 = 10kg、食材が g → 10000)。種類が違えば(g と L)null */
export function conversionToIngredientUnit(conv: Conversion, ingredientUnit: string): number | null {
  if (isSameUnit(conv.unit, ingredientUnit)) return conv.amount;
  const from = measureUnitInfo(conv.unit);
  const to = measureUnitInfo(ingredientUnit);
  if (!from || !to || from.dimension !== to.dimension) return null;
  return conv.amount * (from.toBase / to.toBase);
}

export const CONVERSION_MAX = 1_000_000;

/** 換算の入力の確認。問題なければ null、だめなら理由 */
export function validateConversionInput(raw: string): string | null {
  const s = raw.normalize("NFKC").trim();
  const n = s === "" || !/^\d+(\.\d+)?$/.test(s) ? NaN : Number(s);
  if (!Number.isFinite(n) || n <= 0) return "換算は、0より大きい数で入れてください(例: 1個 = 200g なら 200)";
  if (n > CONVERSION_MAX) return "換算は、1,000,000以下の数で入れてください";
  return null;
}

export type ResolveKind = "same" | "auto" | "converted" | "needs_conversion";

/**
 * 納品書の単位の単価を、食材の単位の単価にする。
 * - same: 同じ単位 / auto: 重さ同士・容量同士(聞かずに換算) / converted: 覚えた(入れた)換算を使った
 * - needs_conversion: 換算が無い・使えない(1個が何gかを聞く)
 */
export function resolveIngredientUnitPrice(i: {
  price: number;
  invoiceUnit: string;
  ingredientUnit: string;
  conversion: Conversion | null;
}): { kind: ResolveKind; price: number | null } {
  if (!i.invoiceUnit || isSameUnit(i.invoiceUnit, i.ingredientUnit)) return { kind: "same", price: roundUnitPrice(i.price) };
  const auto = convertUnitPrice(i.price, i.invoiceUnit, i.ingredientUnit);
  if (auto != null) return { kind: "auto", price: roundUnitPrice(auto) };
  if (i.conversion) {
    const amount = conversionToIngredientUnit(i.conversion, i.ingredientUnit);
    if (amount != null && amount > 0) return { kind: "converted", price: roundUnitPrice(i.price / amount) };
  }
  return { kind: "needs_conversion", price: null };
}

/** 1行分をまとめて計算する(確認の画面の1行) */
export function computeRowPrice(i: {
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  invoiceUnit: string;
  invoiceTaxBasis: InvoiceTaxBasis | null;
  storeTaxMode: IngredientPriceTaxMode;
  taxRatePercent: number;
  ingredientUnit: string;
  conversion: Conversion | null;
}): {
  lineUnitPrice: number | null;
  taxAdjustedUnitPrice: number | null;
  price: number | null;
  kind: ResolveKind | null;
  computedFromAmount: boolean;
  amountMismatch: boolean;
  needsTaxChoice: boolean;
} {
  const line = lineUnitPrice(i);
  const out = {
    lineUnitPrice: line.price,
    taxAdjustedUnitPrice: null as number | null,
    price: null as number | null,
    kind: null as ResolveKind | null,
    computedFromAmount: line.computedFromAmount,
    amountMismatch: line.amountMismatch,
    needsTaxChoice: i.invoiceTaxBasis == null,
  };
  if (line.price == null) return out;
  const taxed = adjustForTax(line.price, i.invoiceTaxBasis, i.storeTaxMode, i.taxRatePercent);
  if (taxed == null) return out;
  out.taxAdjustedUnitPrice = taxed;
  const resolved = resolveIngredientUnitPrice({ price: taxed, invoiceUnit: i.invoiceUnit, ingredientUnit: i.ingredientUnit, conversion: i.conversion });
  out.kind = resolved.kind;
  out.price = resolved.price;
  return out;
}
