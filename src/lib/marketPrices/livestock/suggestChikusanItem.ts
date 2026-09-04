/**
 * 食材名から畜産物の規格(品目コード)候補を「提案」する。
 *
 * ①(青果物)の食材名と違い、「豚肉」「牛肉ロース」のような登録のされ方だと
 * どの規格(和牛A5なのかA4なのか、そもそも「ロース」という部位はこの調査に
 * 存在しない)に対応するか一意に決まらないことが多い。誤って違う規格と
 * 結びつけると、店主の意図しない価格変動で原価計算が狂うリスクがある。
 *
 * そのため、ここでの結果は「初回登録時にプルダウンの初期選択肢として
 * 提示する候補」に留め、①②の青果物マッチングのように確信度highでも
 * 自動的にアラート対象へ確定はしない。実際にアラートに使われるのは、
 * 店主が明示的に確定させた ingredient_market_links の内容だけ
 * (confirmedLinksToMatches.ts)。
 */
import { CHIKUSAN_COLUMNS, CHIKUSAN_ITEM_ALIASES, type ChikusanItemCode } from "./chikusanColumns.ts";
import { headerMatchScore } from "../../mapping/similarity.ts";

export interface ChikusanItemSuggestion {
  itemCode: ChikusanItemCode;
  label: string;
  score: number;
}

const PRICED_CODES = CHIKUSAN_COLUMNS.filter((c) => c.itemCode != null) as (typeof CHIKUSAN_COLUMNS[number] & {
  itemCode: ChikusanItemCode;
})[];

/** スコア降順の候補一覧を返す(空配列にはしない。低スコアでも「これが一番近い」の参考にする) */
export function suggestChikusanItems(ingredientName: string): ChikusanItemSuggestion[] {
  return PRICED_CODES.map((col) => {
    const names = [col.label, ...(CHIKUSAN_ITEM_ALIASES[col.itemCode] ?? [])];
    const score = Math.max(...names.map((n) => headerMatchScore(ingredientName, n)));
    return { itemCode: col.itemCode, label: col.label, score };
  }).sort((a, b) => b.score - a.score);
}
