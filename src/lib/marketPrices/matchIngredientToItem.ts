/**
 * 店主が登録した食材名と、農水省CSVの品目を突き合わせる。
 *
 * ①のCSV取り込みで作った類似度ロジック(mapping/similarity.ts の headerMatchScore、
 * bigram Dice係数 + 短い側2文字未満は包含ボーナスなし)をそのまま流用する。
 * ただし列名同士の比較(①)と違い、こちらは「じゃがいも」⇔「ばれいしょ」のように
 * 文字の重なりが全くない言い換えが多いため、bigram類似度だけでは太刀打ちできない。
 * そこで itemAliases.ts の同義語辞書をまず試し、辞書でヒットしなかった場合だけ
 * bigram類似度にフォールバックする(フォールバックは確信度low、要確認扱い)。
 */
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import { ITEM_ALIASES } from "./itemAliases.ts";
import { headerMatchScore } from "../mapping/similarity.ts";
import { normalizeForDedupe } from "../normalize.ts";

export interface IngredientRef {
  id: string;
  name: string;
}

export type MatchConfidence = "high" | "low";

export interface IngredientItemMatch {
  ingredientId: string;
  ingredientName: string;
  itemCode: string;
  itemName: string;
  confidence: MatchConfidence;
  /** exact: 品目名または同義語辞書と完全一致。fuzzy: bigram類似度によるフォールバック(要確認) */
  method: "exact" | "fuzzy";
  score: number;
}

/** bigramフォールバックで候補として採用する最低スコア。①の自動選択閾値と揃えている。 */
const FUZZY_MIN_SCORE = 0.5;

interface Candidate {
  item: SyuyoItem;
  names: string[]; // 品目名 + 既知の同義語
}

function buildCandidates(items: SyuyoItem[]): Candidate[] {
  return items
    .filter((item) => !item.isBreakdownRow)
    .map((item) => ({
      item,
      names: [item.itemName, ...(ITEM_ALIASES[item.itemCode] ?? [])],
    }));
}

/**
 * 各食材について、最もそれらしい品目を1つ選ぶ(なければ結果に含めない)。
 * 完全一致(exact)が見つかればそれを優先し、なければbigram類似度の最高スコアを採用する。
 */
export function matchIngredientsToItems(
  ingredients: IngredientRef[],
  items: SyuyoItem[],
): IngredientItemMatch[] {
  const candidates = buildCandidates(items);
  const matches: IngredientItemMatch[] = [];

  for (const ingredient of ingredients) {
    const normalizedIngredient = normalizeForDedupe(ingredient.name);

    // 1. 完全一致(品目名そのもの、または同義語辞書のいずれかと一致)
    const exactCandidate = candidates.find((c) =>
      c.names.some((n) => normalizeForDedupe(n) === normalizedIngredient),
    );
    if (exactCandidate) {
      matches.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        itemCode: exactCandidate.item.itemCode,
        itemName: exactCandidate.item.itemName,
        confidence: "high",
        method: "exact",
        score: 1,
      });
      continue;
    }

    // 2. フォールバック: bigram類似度(①と同じロジック)の最高スコア
    let best: { candidate: Candidate; score: number } | null = null;
    for (const candidate of candidates) {
      for (const name of candidate.names) {
        const score = headerMatchScore(ingredient.name, name);
        if (!best || score > best.score) best = { candidate, score };
      }
    }
    if (best && best.score >= FUZZY_MIN_SCORE) {
      matches.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        itemCode: best.candidate.item.itemCode,
        itemName: best.candidate.item.itemName,
        confidence: "low",
        method: "fuzzy",
        score: best.score,
      });
    }
  }

  return matches;
}
