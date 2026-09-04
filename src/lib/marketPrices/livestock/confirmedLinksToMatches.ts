/**
 * 店主が明示的に確定させた「食材 -> 畜産物規格」のリンクを、
 * generateAlerts.ts がそのまま扱える IngredientItemMatch[] の形に変換する。
 *
 * ①②の青果物マッチング(matchIngredientToItem.ts)は表記ゆれ吸収の自動マッチングだが、
 * 畜産物は規格の曖昧さがあるため自動マッチングをせず、店主が確定させたリンクだけを
 * 「確信度high・確定済み」として扱う。IngredientItemMatch型自体はそのまま再利用する
 * ことで、generateAlerts.ts 側は青果物・畜産物の違いを意識せずに済む。
 */
import type { IngredientItemMatch } from "../matchIngredientToItem.ts";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "./chikusanColumns.ts";

export interface ConfirmedIngredientLink {
  ingredientId: string;
  ingredientName: string;
  itemCode: ChikusanItemCode;
}

const LABEL_BY_CODE = new Map(CHIKUSAN_COLUMNS.filter((c) => c.itemCode).map((c) => [c.itemCode, c.label]));

export function confirmedLinksToMatches(links: ConfirmedIngredientLink[]): IngredientItemMatch[] {
  return links.map((link) => ({
    ingredientId: link.ingredientId,
    ingredientName: link.ingredientName,
    itemCode: link.itemCode,
    itemName: LABEL_BY_CODE.get(link.itemCode) ?? link.itemCode,
    confidence: "high",
    method: "exact",
    score: 1,
  }));
}
