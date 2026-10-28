/**
 * 換算の目安(玉ねぎ1個 約200g など。2026-10-28、値はMahiro確認済み)。テストは conversionEstimates.test.ts(E)。
 * DBには入れない。確認の画面で「目安」として最初の値に入れるだけで、店主が確かめて確定した値だけを覚える
 * (確定した目安は、換算の表に source = 'estimate' で入る。確かめていない目安は保存しない。conversionMemory.ts)。
 */
import { normalizeForDedupe } from "../normalize.ts";
import { isSameUnit, measureUnitInfo } from "./convertUnitPrice.ts";
import type { Conversion } from "./unitPrice.ts";

export interface ConversionEstimate {
  /** 呼び方(先頭が代表の名前) */
  names: string[];
  /** 仕入れの単位 */
  units: string[];
  /** 1つあたりの重さ(g) */
  grams: number;
}

export const CONVERSION_ESTIMATES: ConversionEstimate[] = [
  { names: ["玉ねぎ", "たまねぎ", "タマネギ", "玉葱"], units: ["個"], grams: 200 },
  { names: ["にんじん", "人参", "ニンジン"], units: ["本"], grams: 150 },
  { names: ["じゃがいも", "ジャガイモ", "馬鈴薯"], units: ["個"], grams: 150 },
  { names: ["キャベツ"], units: ["玉", "個"], grams: 1200 },
  { names: ["白菜", "はくさい", "ハクサイ"], units: ["株", "個"], grams: 2000 },
  { names: ["大根", "だいこん", "ダイコン"], units: ["本"], grams: 1000 },
  { names: ["トマト"], units: ["個"], grams: 150 },
  { names: ["きゅうり", "胡瓜", "キュウリ"], units: ["本"], grams: 100 },
  { names: ["なす", "茄子", "ナス"], units: ["本"], grams: 80 },
  { names: ["ピーマン"], units: ["個"], grams: 35 },
  { names: ["長ねぎ", "長ネギ", "白ねぎ"], units: ["本"], grams: 100 },
  { names: ["レタス"], units: ["玉", "個"], grams: 300 },
  { names: ["ブロッコリー"], units: ["株", "個"], grams: 250 },
  { names: ["レモン"], units: ["個"], grams: 100 },
];

/** 目安の換算(食材の単位で)。目安が無い・食材の単位が重さでなければ null */
export function estimateConversion(ingredientName: string, purchaseUnit: string, ingredientUnit: string): Conversion | null {
  const info = measureUnitInfo(ingredientUnit);
  if (!info || info.dimension !== "weight") return null;
  const key = normalizeForDedupe(ingredientName);
  const hit = CONVERSION_ESTIMATES.find((e) => e.names.some((n) => normalizeForDedupe(n) === key) && e.units.some((u) => isSameUnit(u, purchaseUnit)));
  if (!hit) return null;
  return { amount: hit.grams / info.toBase, unit: ingredientUnit };
}
