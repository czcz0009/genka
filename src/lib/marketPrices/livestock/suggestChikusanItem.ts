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
 *
 * 【不具合修正】以前は「食材名にかかわらず、畜産物の全規格(豚・牛・鶏)を
 * スコア順に並べて返す」実装になっており、次の2つの実害が出ていた:
 *  1. 野菜など畜産物と無関係な食材にまで、規格選択候補が表示される
 *     (呼び出し側でこの結果が空かどうかを見て表示/非表示を切り替えている)
 *  2. 「牛肉」という食材名に対して、豚肉・鶏肉の規格までスコアが低いだけで
 *     候補に混ざって出てしまう(豚肉のスコアが牛肉の中の低スコア規格より
 *     たまたま高いと、豚の規格が上位候補になり得た)
 * 対策として、まず食材名から「豚/牛/鶏のどれとして扱うべきか」を判定し、
 * 判定できない場合は候補を一切返さない(=呼び出し側で規格選択UI自体を
 * 出さない)。判定できた場合も、その種類の規格だけをスコアリング対象にする。
 */
import { CHIKUSAN_COLUMNS, CHIKUSAN_ITEM_ALIASES, type ChikusanItemCode } from "./chikusanColumns.ts";
import { headerMatchScore } from "../../mapping/similarity.ts";

export interface ChikusanItemSuggestion {
  itemCode: ChikusanItemCode;
  label: string;
  score: number;
}

type ChikusanSpecies = "pork" | "beef" | "chicken";

/** 品目コード(規格)がどの畜種に属するか。CHIKUSAN_COLUMNSのラベルから機械的に決まる固定対応。 */
const SPECIES_BY_ITEM_CODE: Record<ChikusanItemCode, ChikusanSpecies> = {
  pork_tokyo: "pork",
  wagyu_a5: "beef",
  wagyu_a4: "beef",
  cross_b3: "beef",
  dairy_b2: "beef",
  mature_cattle_m: "beef",
  chicken_thigh: "chicken",
  chicken_breast: "chicken",
};

/** 食材名にこの語が含まれていれば、その畜種の食材だと判定するためのキーワード。 */
const SPECIES_KEYWORDS: Record<ChikusanSpecies, string[]> = {
  pork: ["豚", "ぶた", "ポーク", "pork"],
  beef: ["牛", "ぎゅう", "ビーフ", "beef"],
  chicken: ["鶏", "とり", "鳥", "チキン", "chicken"],
};

/**
 * 「鶏卵」「牛乳」のように、畜種を表す漢字は含むが実際には肉ではない食材名を
 * 誤って畜産物の規格選択対象にしないための除外語。該当すれば問答無用で対象外にする。
 */
const NON_MEAT_KEYWORDS = ["卵", "牛乳", "チーズ", "バター", "ヨーグルト", "生クリーム", "アイス"];

/** 食材名から畜種(豚/牛/鶏)を判定する。どれにも当てはまらなければnull(=畜産物の対象外)。 */
function classifySpecies(ingredientName: string): ChikusanSpecies | null {
  if (NON_MEAT_KEYWORDS.some((k) => ingredientName.includes(k))) return null;
  for (const species of Object.keys(SPECIES_KEYWORDS) as ChikusanSpecies[]) {
    if (SPECIES_KEYWORDS[species].some((k) => ingredientName.includes(k))) return species;
  }
  return null;
}

const PRICED_CODES = CHIKUSAN_COLUMNS.filter((c) => c.itemCode != null) as (typeof CHIKUSAN_COLUMNS[number] & {
  itemCode: ChikusanItemCode;
})[];

/**
 * スコア降順の候補一覧を返す。食材名がどの畜種にも判定できなければ空配列
 * (呼び出し側はこれをもって「この食材には規格選択UIを出さない」と判断する)。
 * 判定できた場合も、その畜種の規格だけを候補にする(他畜種は一切混ぜない)。
 */
export function suggestChikusanItems(ingredientName: string): ChikusanItemSuggestion[] {
  const species = classifySpecies(ingredientName);
  if (!species) return [];

  return PRICED_CODES.filter((col) => SPECIES_BY_ITEM_CODE[col.itemCode] === species)
    .map((col) => {
      const names = [col.label, ...(CHIKUSAN_ITEM_ALIASES[col.itemCode] ?? [])];
      const score = Math.max(...names.map((n) => headerMatchScore(ingredientName, n)));
      return { itemCode: col.itemCode, label: col.label, score };
    })
    .sort((a, b) => b.score - a.score);
}
