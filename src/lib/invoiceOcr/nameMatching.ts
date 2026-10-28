/**
 * 名前の対応づけを覚える(設計の4段目、2026-10-28)。テストは nameMatching.test.ts(N-1〜N-10)。
 *
 * 納品書の表記を、登録済みの食材に結びつける順番:
 *   1. そろえた名前が同じ → 自動で選ぶ(kind: name)
 *   2. 店主が前に選んだ対応を覚えている → 自動で選ぶ(kind: alias。マイグレーション0032の ingredient_name_aliases)
 *   3. 候補として出すだけ(kind: candidates。自動では選ばない)
 *      - 野菜の同義語の辞書(市場価格の照合と同じ marketPrices/itemAliases.ts)で同じ仲間(玉葱・たまねぎ、にんじん・人参)を先に
 *      - 次に、文字の並びが似ている(4割以上)か、片方がもう片方を含む名前
 *   4. どれも無い(kind: none)
 */
import { normalizeForDedupe } from "../normalize.ts";
import { stringSimilarity } from "../mapping/similarity.ts";
import { ITEM_ALIASES } from "../marketPrices/itemAliases.ts";

/** 名前のそろえ方: 今までのそろえ方(全角半角・空白・括弧・区切り)に加えて、カタカナをひらがなにする */
export function normalizeIngredientName(raw: string): string {
  return normalizeForDedupe(raw).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 同義語の辞書: そろえた名前 → 仲間の番号(同じ番号なら同じ野菜) */
const SYNONYM_GROUP = new Map<string, string>();
for (const [code, names] of Object.entries(ITEM_ALIASES)) {
  for (const n of names) SYNONYM_GROUP.set(normalizeIngredientName(n), code);
}

export type IngredientMatch =
  | { kind: "name" | "alias"; ingredientId: string }
  | { kind: "candidates"; ingredientIds: string[] }
  | { kind: "none" };

const SIMILAR_THRESHOLD = 0.4;
const MAX_CANDIDATES = 3;

export function matchIngredient(
  invoiceName: string,
  ingredients: { id: string; name: string }[],
  aliases: { ingredientId: string; normalizedAlias: string }[],
): IngredientMatch {
  const key = normalizeIngredientName(invoiceName);
  if (!key) return { kind: "none" };
  const byName = ingredients.find((i) => normalizeIngredientName(i.name) === key);
  if (byName) return { kind: "name", ingredientId: byName.id };
  const ids = new Set(ingredients.map((i) => i.id));
  const alias = aliases.find((a) => a.normalizedAlias === key && ids.has(a.ingredientId));
  if (alias) return { kind: "alias", ingredientId: alias.ingredientId };

  const out: string[] = [];
  const group = SYNONYM_GROUP.get(key);
  if (group) {
    for (const i of ingredients) if (SYNONYM_GROUP.get(normalizeIngredientName(i.name)) === group) out.push(i.id);
  }
  const similar = ingredients
    .map((i) => {
      const n = normalizeIngredientName(i.name);
      const contains = n.length >= 2 && key.length >= 2 && (key.includes(n) || n.includes(key));
      return { id: i.id, score: contains ? 1 : stringSimilarity(key, n) };
    })
    .filter((x) => x.score >= SIMILAR_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  for (const s of similar) if (!out.includes(s.id)) out.push(s.id);
  return out.length > 0 ? { kind: "candidates", ingredientIds: out.slice(0, MAX_CANDIDATES) } : { kind: "none" };
}

export const MAX_ALIAS_LENGTH = 100;

export interface AliasRowToSave {
  ingredient_id: string;
  alias: string;
  normalized_alias: string;
}

/** 覚える対応(店主が選び直した行で、「この名前を覚える」に印があり、確定できたときだけ)。覚えないなら null */
export function aliasToSave(i: {
  invoiceName: string;
  /** 店主が選んだ登録済みの食材(新しい食材として登録したなら null) */
  chosen: { id: string; name: string } | null;
  /** 自動で選んだまま(名前・覚えた対応で一致)か */
  autoMatched: boolean;
  remember: boolean;
  rowSaved: boolean;
}): AliasRowToSave | null {
  if (!i.chosen || i.autoMatched || !i.remember || !i.rowSaved) return null;
  const alias = i.invoiceName.trim();
  const normalized = normalizeIngredientName(alias);
  if (!alias || !normalized || alias.length > MAX_ALIAS_LENGTH || normalized.length > MAX_ALIAS_LENGTH) return null;
  if (normalized === normalizeIngredientName(i.chosen.name)) return null;
  return { ingredient_id: i.chosen.id, alias, normalized_alias: normalized };
}
