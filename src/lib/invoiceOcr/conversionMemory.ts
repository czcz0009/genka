/**
 * 換算を覚える(保存する)かどうかの決まり(2026-10-28)。テストは conversionMemory.test.ts(M)。
 *
 * 換算の表(マイグレーション0031)の source:
 *   'owner'    = 店主が入れた(直した)値
 *   'estimate' = 目安の値を、店主が「この値で正しい」に印を付けて、そのまま確定したもの
 * 店主が確かめていない目安は、保存しない(conversionToSave が null を返す)。
 */
import { convertUnitPrice, isSameUnit } from "./convertUnitPrice.ts";
import { estimateConversion } from "./conversionEstimates.ts";
import { validateConversionInput, type Conversion } from "./unitPrice.ts";

/** remembered = DBに覚えている値のまま / estimate = 目安のまま / owner = 店主が入れた・直した値 */
export type ConversionSource = "remembered" | "estimate" | "owner";

export interface ConversionState {
  /** 入力欄の値(1仕入れ単位 = value unit) */
  value: string;
  unit: string;
  source: ConversionSource;
  /** 目安を店主が確かめたか(source が estimate のときだけ意味がある) */
  estimateConfirmed: boolean;
  /** 「この換算を覚える」の印 */
  remember: boolean;
}

/** 換算が要る行なら最初の状態、要らない行(同じ単位・重さ同士・容量同士)なら null */
export function initialConversionState(i: {
  ingredientName: string;
  purchaseUnit: string;
  ingredientUnit: string;
  remembered: Conversion | null;
}): ConversionState | null {
  if (!i.purchaseUnit || isSameUnit(i.purchaseUnit, i.ingredientUnit)) return null;
  if (convertUnitPrice(1, i.purchaseUnit, i.ingredientUnit) != null) return null;
  if (i.remembered) return { value: String(i.remembered.amount), unit: i.remembered.unit, source: "remembered", estimateConfirmed: false, remember: true };
  const est = estimateConversion(i.ingredientName, i.purchaseUnit, i.ingredientUnit);
  if (est) return { value: String(est.amount), unit: est.unit, source: "estimate", estimateConfirmed: false, remember: true };
  return { value: "", unit: i.ingredientUnit, source: "owner", estimateConfirmed: false, remember: true };
}

/** 店主が値を直した → 店主の値 */
export function editConversionValue(s: ConversionState, value: string): ConversionState {
  return { ...s, value, source: "owner", estimateConfirmed: false };
}

/** 目安に「この値で正しい」の印を付けた */
export function confirmEstimate(s: ConversionState, confirmed = true): ConversionState {
  return { ...s, estimateConfirmed: confirmed };
}

/** 目安のまま、まだ確かめていない */
export function isUnconfirmedEstimate(s: ConversionState | null): boolean {
  return s != null && s.source === "estimate" && !s.estimateConfirmed;
}

/** 入力欄の値を数にする(だめなら null) */
export function conversionFromState(s: ConversionState | null): Conversion | null {
  if (!s || validateConversionInput(s.value) != null) return null;
  return { amount: Number(s.value.normalize("NFKC").trim()), unit: s.unit };
}

export interface ConversionRowToSave {
  ingredient_id: string;
  purchase_unit: string;
  amount: number;
  amount_unit: string;
  source: "owner" | "estimate";
}

/** 換算の表に保存する行。保存しないなら null */
export function conversionToSave(i: {
  included: boolean;
  rowSaved: boolean;
  ingredientId: string;
  purchaseUnit: string;
  conversion: ConversionState | null;
}): ConversionRowToSave | null {
  const s = i.conversion;
  if (!i.included || !i.rowSaved || !s || !s.remember) return null;
  if (s.source === "remembered") return null; // 覚えた値のまま。書き直さない
  if (isUnconfirmedEstimate(s)) return null; // 確かめていない目安は保存しない
  const conv = conversionFromState(s);
  if (!conv) return null;
  return { ingredient_id: i.ingredientId, purchase_unit: i.purchaseUnit.trim(), amount: conv.amount, amount_unit: conv.unit, source: s.source };
}
