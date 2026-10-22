/**
 * 利用者が確定した、食材と市場の品目の紐づけ(ingredient_market_links。2026-10-22、0026マイグレーション)。
 *
 * 種類(source):
 *   'chikusan' = 食肉の規格に紐づけ(itemCode = 規格のコード)
 *   'syuyo'    = 野菜・果物の品目に紐づけ(itemCode = 農水省の品目コード)
 *   'excluded' = 市場価格と比べない(itemCode = null)
 * 1つの食材に紐づけは1つだけ(DBの決まり unique (ingredient_id))。
 *
 * 優先順: ①利用者が確定した紐づけ → ②辞書との完全一致(紛らわしい名前を除く)→ ③推定(確認が必要)。
 * テストは userMarketLinks.test.ts(期待値C-1〜C-14はMahiro確認済み)。
 */
import type { IngredientItemMatch } from "./matchIngredientToItem.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import { ITEM_ALIASES } from "./itemAliases.ts";

export type UserMarketLinkSource = "chikusan" | "syuyo" | "excluded";

export interface UserMarketLink {
  ingredientId: string;
  source: UserMarketLinkSource;
  itemCode: string | null;
}

/**
 * 自動の対応づけ(辞書・推定)に、利用者が確定した紐づけを上書きする。
 * - 野菜・果物に確定 → 確信度highの対応づけにする(推定だった名前でもアラートが出る)
 * - 比べない・食肉に紐づけ → 野菜・果物の対応づけを外す
 * knownItems は品目名を引くためのもの(今の旬に無い品目は、前の旬や辞書の名前を使う)。
 */
export function applyUserLinksToProduceMatches(
  autoMatches: IngredientItemMatch[],
  links: UserMarketLink[],
  knownItems: SyuyoItem[],
): IngredientItemMatch[] {
  const linkByIngredientId = new Map(links.map((l) => [l.ingredientId, l]));
  const nameByCode = new Map(knownItems.map((i) => [i.itemCode, i.itemName]));
  const result: IngredientItemMatch[] = [];

  for (const m of autoMatches) {
    if (!linkByIngredientId.has(m.ingredientId)) result.push(m);
  }
  for (const link of links) {
    if (link.source !== "syuyo" || !link.itemCode) continue;
    const auto = autoMatches.find((m) => m.ingredientId === link.ingredientId);
    result.push({
      ingredientId: link.ingredientId,
      ingredientName: auto?.ingredientName ?? "",
      itemCode: link.itemCode,
      itemName: nameByCode.get(link.itemCode) ?? ITEM_ALIASES[link.itemCode]?.[0] ?? link.itemCode,
      confidence: "high",
      method: "user",
      score: 1,
    });
  }
  return result;
}

/** アラート画面上部・ダッシュボードの「市場価格と比べるか、確認が必要な食材◯件」(推定の食材だけを数える) */
export function countIngredientsNeedingReview(rows: { status: string }[]): number {
  return rows.filter((r) => r.status === "needsReview").length;
}
