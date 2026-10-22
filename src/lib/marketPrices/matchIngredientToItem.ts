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
  /** exact: 品目名または同義語辞書と完全一致。fuzzy: bigram類似度によるフォールバック(要確認)。user: 利用者が確定した */
  method: "exact" | "fuzzy" | "user";
  score: number;
}

/** bigramフォールバックで候補として採用する最低スコア。①の自動選択閾値と揃えている。 */
const FUZZY_MIN_SCORE = 0.5;

interface Candidate {
  item: SyuyoItem;
  names: string[]; // 品目名 + 既知の同義語
}

/**
 * 辞書と一致しても「推定(確認が必要)」に下げる名前(2026-10-22、Mahiro確認済み)。
 * 飲食店では別の食材を指すことが多い短い読み(もも=鶏もも、かき=牡蠣)や、加工品を指すことが多い名前
 * (ポテト=冷凍のフライドポテト、コーン=缶詰など)、食材以外の意味もある名前(なし=無し)。
 * 漢字の「桃」「白桃」「柿」「梨」や「いんげん」は、今までどおり確定。
 * 推定の結びつきはアラートを出さず、利用者が「合っている」と確定させたときだけ追跡する。
 */
const AMBIGUOUS_NAMES = new Set(
  ["もも", "モモ", "かき", "カキ", "ポテト", "コーン", "パイン", "ガーリック", "チェリー", "うめ", "梅", "ウメ", "グリーンピース", "なし"].map(
    normalizeForDedupe,
  ),
);

/** 似た名前の推定でまちがえる名前(いか→すいか、みりん→りんご、みょうが→しょうが)。推定の対象外にする */
const NO_FUZZY_NAMES = new Set(["いか", "イカ", "烏賊", "みりん", "味醂", "みょうが", "茗荷"].map(normalizeForDedupe));

/**
 * 肉を表す語を含む名前は、野菜・果物に推定で結びつけない(鶏もも肉→もも(桃)を防ぐ)。
 * 辞書との完全一致は先に見るので、「牛蒡」→ごぼう は今までどおり確定で結びつく。
 */
const MEAT_WORDS = /[肉鶏豚牛]/;

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
        // 紛らわしい名前は、辞書と一致しても推定(確認が必要)にする
        confidence: AMBIGUOUS_NAMES.has(normalizedIngredient) ? "low" : "high",
        method: "exact",
        score: 1,
      });
      continue;
    }

    if (NO_FUZZY_NAMES.has(normalizedIngredient) || MEAT_WORDS.test(ingredient.name)) continue;

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
