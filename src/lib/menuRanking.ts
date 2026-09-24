/**
 * 「今見直すべきメニュー」一覧(旧: 収益ランキング)。
 *
 * 「原価率」だけでなく「販売数量 × (売価-原価)」で実際の利益貢献度を算出する。
 * 原価率が低くても数が出ないメニューより、原価率がやや高くてもよく出るメニューの方が
 * 店の利益への貢献が大きい、というケースを見えるようにするのが狙い。
 *
 * 並び順は「利益貢献度が高い順」ではなく「対応の優先度が高い順」にしている。
 * 1. 目標原価率を超えているメニュー(overTarget=true)を先に出す
 *    (その中では、値上げした場合の月間効果(値上げ目安額×販売数量)が
 *    大きい順。販売数量がまだ登録されていない等で効果が0円同士になる場合は、
 *    原価率の超過幅が大きい順で並べる)
 * 2. 目標内のメニューは、従来通り利益貢献度の高い順(売価未設定は末尾)
 *
 * また、食材の「1つ前の仕入単価」が分かる場合(RankingIngredient.previousPurchasePrice)、
 * 「(従来の原価-現在の原価)×月間販売数量」で月間の利益への影響額(monthlyProfitImpact)も
 * 計算する。マイナス=値上がりで利益が減った、プラス=値下がりで利益が増えた。
 */
import {
  calcMenuTotalCost,
  calcCostRate,
  calcSuggestedPriceIncrease,
  calcEffectiveUnitPrice,
  type UnitPriceMap,
} from "./costCalc.ts";
import type { MenuCostSummary } from "./types.ts";

export interface RankingMenu {
  id: string;
  name: string;
  sellingPrice: number | null;
  /** null なら defaultTargetCostRate を使う */
  targetCostRate: number | null;
}

export interface RankingMenuIngredient {
  menuId: string;
  ingredientId: string;
  quantity: number;
}

export interface RankingIngredient {
  id: string;
  currentPurchasePrice: number;
  /**
   * 1つ前(直近の変更より前)の仕入単価。分かっている食材だけ渡せばよい
   * (省略・undefined/null = 「変わったかどうか分からない」ため、その食材は
   * 価格が変わっていないものとして扱う=影響額の計算に0円として寄与する)。
   */
  previousPurchasePrice?: number | null;
  /** 歩留まり率(%)。未指定・100なら仕入単価をそのまま使う(従来通り)。 */
  yieldRatePercent?: number | null;
}

/** 対象期間に集計済みの、メニューごとの販売数量 */
export interface RankingSales {
  menuId: string;
  quantitySold: number;
}

export interface BuildMenuRankingInput {
  menus: RankingMenu[];
  menuIngredients: RankingMenuIngredient[];
  ingredients: RankingIngredient[];
  sales: RankingSales[];
  defaultTargetCostRate: number;
  /** 値上げ目安額の丸め単位(円)。デフォルト10円。 */
  priceRoundTo?: number;
}

/** 値上げした場合の月間効果の目安(値上げ目安額 × 月間販売数量)。優先度の並び替えにのみ使う内部値。 */
function monthlyImpact(s: Pick<MenuCostSummary, "suggestedPriceIncrease" | "quantitySold">): number {
  return (s.suggestedPriceIncrease ?? 0) * s.quantitySold;
}

/** 原価率が目標を何ポイント超えているか。目標内・原価率不明なら0。 */
function overageWidth(s: Pick<MenuCostSummary, "costRate" | "targetCostRate">): number {
  return s.costRate != null ? s.costRate - s.targetCostRate : 0;
}

/**
 * 「対応の優先度」順の比較関数。詳細はファイル冒頭のコメントを参照。
 */
function compareByReviewPriority(a: MenuCostSummary, b: MenuCostSummary): number {
  if (a.overTarget !== b.overTarget) return a.overTarget ? -1 : 1;

  if (a.overTarget) {
    const impactDiff = monthlyImpact(b) - monthlyImpact(a);
    if (impactDiff !== 0) return impactDiff;
    return overageWidth(b) - overageWidth(a);
  }

  if (a.profitContribution == null && b.profitContribution == null) return 0;
  if (a.profitContribution == null) return 1;
  if (b.profitContribution == null) return -1;
  return b.profitContribution - a.profitContribution;
}

/**
 * 「今見直すべきメニュー」一覧を組み立てる。並び順は compareByReviewPriority を参照。
 * 売価未設定などで貢献度が計算できないメニューは(目標内グループの)末尾に回す。
 */
/**
 * 「値上げ余地」ありと見なす、目標原価率との差(ポイント)のしきい値。
 * flRatio.tsのCAUTION_MARGIN_POINTSと同じ考え方(統計的根拠のある値ではなく、
 * ちょうど目標ぴったりでも余地扱いにならないよう設けた説明可能なデフォルト値)。
 */
export const PRICE_HEADROOM_MARGIN_POINTS = 10;

/**
 * 「今見直すべきメニュー」と対になる、値上げ余地のあるメニューの抽出。
 * 原価率が目標より大幅に低い(=現在の価格で既に目標より高い利益率を確保できている)
 * メニューを、差(ポイント)が大きい順に返す。
 *
 * 「いくらまで値上げすべきか」という具体的な金額はここでは計算しない
 * (calcRequiredSellingPrice等の値上げ目安の計算式は原価率を目標まで下げる方向の
 * ものであり、逆方向(既に目標より低い原価率をさらにどこまで上げられるか)に
 * そのまま転用すると誤った金額を示しかねないため)。あくまで「候補として目を
 * 向けるべきメニュー」を挙げるところまでに留め、実際の金額試算は各メニューの
 * 編集画面にある既存の値上げシミュレーションを使ってもらう設計にしている。
 */
export function findPriceHeadroomMenus(
  summaries: MenuCostSummary[],
  marginPoints: number = PRICE_HEADROOM_MARGIN_POINTS,
): MenuCostSummary[] {
  return summaries
    .filter((s) => s.costRate != null && s.targetCostRate - s.costRate >= marginPoints)
    .sort((a, b) => b.targetCostRate - (b.costRate ?? 0) - (a.targetCostRate - (a.costRate ?? 0)));
}

export function buildMenuRanking(input: BuildMenuRankingInput): MenuCostSummary[] {
  const { menus, menuIngredients, ingredients, sales, defaultTargetCostRate, priceRoundTo = 10 } = input;

  // 歩留まり率(仕入れた量のうち実際に使える割合)を考慮した実質単価を使う。
  // 歩留まり率は価格変更で変わるものではないので、現在・1つ前どちらの単価にも同じ率を適用する。
  const unitPrices: UnitPriceMap = new Map(
    ingredients.map((i) => [i.id, calcEffectiveUnitPrice(i.currentPurchasePrice, i.yieldRatePercent)]),
  );
  // 「1つ前の単価」が分からない食材は、現在の単価と同じ(=変化なし)として扱う
  const previousUnitPrices: UnitPriceMap = new Map(
    ingredients.map((i) => [
      i.id,
      calcEffectiveUnitPrice(i.previousPurchasePrice ?? i.currentPurchasePrice, i.yieldRatePercent),
    ]),
  );
  const salesByMenuId = new Map(sales.map((s) => [s.menuId, s.quantitySold]));
  const linesByMenuId = new Map<string, RankingMenuIngredient[]>();
  for (const line of menuIngredients) {
    const list = linesByMenuId.get(line.menuId) ?? [];
    list.push(line);
    linesByMenuId.set(line.menuId, list);
  }

  const summaries: MenuCostSummary[] = menus.map((menu) => {
    const lines = linesByMenuId.get(menu.id) ?? [];
    const totalCost = calcMenuTotalCost(lines, unitPrices);
    const costRate = calcCostRate(totalCost, menu.sellingPrice);
    const targetCostRate = menu.targetCostRate ?? defaultTargetCostRate;
    const overTarget = costRate != null && costRate > targetCostRate;
    const quantitySold = salesByMenuId.get(menu.id) ?? 0;
    const profitContribution =
      menu.sellingPrice != null ? quantitySold * (menu.sellingPrice - totalCost) : null;
    const suggestedPriceIncrease = overTarget
      ? calcSuggestedPriceIncrease(totalCost, menu.sellingPrice, targetCostRate, priceRoundTo)
      : 0;

    // 販売数量が未登録(0件)の場合は「まだ計算できない」ものとしてnullにする
    // (0円と表示すると、実際には影響があるのに登録漏れで0円に見えてしまうため)。
    const previousTotalCost = calcMenuTotalCost(lines, previousUnitPrices);
    const monthlyProfitImpact = quantitySold > 0 ? (previousTotalCost - totalCost) * quantitySold : null;

    return {
      menuId: menu.id,
      menuName: menu.name,
      sellingPrice: menu.sellingPrice,
      totalCost,
      costRate,
      targetCostRate,
      overTarget,
      quantitySold,
      profitContribution,
      suggestedPriceIncrease,
      monthlyProfitImpact,
    };
  });

  summaries.sort(compareByReviewPriority);

  return summaries;
}
