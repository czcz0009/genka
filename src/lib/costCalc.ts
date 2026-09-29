/**
 * メニューの原価・原価率計算。②(仕入れ値変動アラート)・③(利益貢献度ランキング)の
 * どちらからも使う共通ロジック。
 *
 * 前提: menu_ingredients.quantity の単位は、対応する ingredients.unit と一致している
 * ("300g" のレシピ行に対して仕入単価が「kgあたり」のように単位が食い違うケースは、
 * ①の取り込み時点で同一食材の単位食い違いとして警告済みのため、ここでは考慮しない)。
 */
export interface CostCalcMenuIngredient {
  ingredientId: string;
  quantity: number;
}

export interface UnitPriceEntry {
  /** 単位あたりの実質単価(歩留まり調整済み)。isSet=falseのときは参考値(通常0)。 */
  price: number;
  /** 単価が入力済みかどうか。falseなら未設定。 */
  isSet: boolean;
}

/** ingredientId -> 現在の仕入単価(単位あたり、歩留まり調整済み)と設定状況 */
export type UnitPriceMap = Map<string, UnitPriceEntry>;

export interface MenuTotalCostResult {
  /** 単価不明な食材を0円として計算した参考値。集計・下限計算に使う。 */
  totalCost: number;
  /** 単価が未設定の食材のID一覧(そのメニューで使われている分、出現順・重複なし)。 */
  unsetIngredientIds: string[];
}

/**
 * 歩留まり率(仕入れた量のうち実際に料理に使える割合)を考慮した、実質の仕入単価。
 * 例: 1尾800円(1000gあたり)で仕入れた魚の歩留まり率が70%なら、可食部100gあたりの
 * 実質単価は 800÷0.7 = 約1,143円(1000gあたり)とみなす。
 *
 * yieldRatePercentが未指定・100(または不正な値)なら仕入単価をそのまま返す
 * (歩留まりを入力していない食材は従来通りの計算になる、という要件)。
 */
export function calcEffectiveUnitPrice(purchasePrice: number, yieldRatePercent?: number | null): number {
  if (yieldRatePercent == null || yieldRatePercent <= 0 || yieldRatePercent > 100) return purchasePrice;
  return purchasePrice / (yieldRatePercent / 100);
}

/**
 * メニュー1品分の合計原価。単価が見つからない食材は0円として計算に含める
 * (参考値。unsetIngredientIdsに含めて呼び出し側に知らせる)。
 * 単価が未設定(isSet=false)の食材も同様に0円として合計には加えるが、
 * unsetIngredientIdsに含める(画面側は、これが1件でもあれば原価率の数字を
 * 出さずに「計算できていません」を表示する、という使い分けをする)。
 */
export function calcMenuTotalCost(
  menuIngredients: CostCalcMenuIngredient[],
  unitPrices: UnitPriceMap,
): MenuTotalCostResult {
  const unsetIds = new Set<string>();
  const totalCost = menuIngredients.reduce((sum, line) => {
    const entry = unitPrices.get(line.ingredientId);
    // 単価一覧に無い食材(削除済みなどの異常系)も、安全側に倒して未設定扱いにする。
    if (entry == null) {
      unsetIds.add(line.ingredientId);
      return sum;
    }
    if (!entry.isSet) unsetIds.add(line.ingredientId);
    return sum + entry.price * line.quantity;
  }, 0);
  return { totalCost, unsetIngredientIds: [...unsetIds] };
}

/** 原価率(%)。売価が未設定(null)または0以下なら計算不能としてnullを返す。 */
export function calcCostRate(totalCost: number, sellingPrice: number | null): number | null {
  if (sellingPrice == null || sellingPrice <= 0) return null;
  return (totalCost / sellingPrice) * 100;
}

/**
 * 目標原価率まで下げるのに必要な値上げ額の目安(円)。
 * 「理想の原価率30%に対し実際37%、適正価格に戻すには+150円が目安」のような表示に使う。
 *
 * 必要売価 = 原価 ÷ (目標原価率 / 100) を計算し、現在売価との差額を roundTo 単位で
 * 切り上げる(切り捨てると値上げ後もわずかに目標未達になり得るため、必ず切り上げる)。
 * すでに目標原価率以下なら 0 を返す(値上げ不要)。
 */
export function calcSuggestedPriceIncrease(
  totalCost: number,
  currentSellingPrice: number | null,
  targetCostRatePercent: number,
  roundTo = 10,
): number | null {
  if (currentSellingPrice == null || currentSellingPrice <= 0) return null;
  if (targetCostRatePercent <= 0) return null;

  const requiredPrice = totalCost / (targetCostRatePercent / 100);
  const rawIncrease = requiredPrice - currentSellingPrice;
  if (rawIncrease <= 0) return 0;
  return Math.ceil(rawIncrease / roundTo) * roundTo;
}

/**
 * 目標原価率ちょうどにするための必要売価そのもの(円)を逆算する。
 * calcSuggestedPriceIncreaseは「現在の売価からの値上げ額」を切り上げるが、
 * こちらは現在の売価に関係なく「原価率を目標以下にするための売価」を
 * roundTo単位で切り上げて直接返す(値上げシミュレーション画面向け)。
 *
 * 必要売価 = 原価 ÷ (目標原価率 / 100)。原価が0円なら0を返す。
 */
export function calcRequiredSellingPrice(
  totalCost: number,
  targetCostRatePercent: number,
  roundTo = 10,
): number | null {
  if (targetCostRatePercent <= 0) return null;
  if (totalCost < 0) return null;
  if (totalCost === 0) return 0;

  const requiredPrice = totalCost / (targetCostRatePercent / 100);
  return Math.ceil(requiredPrice / roundTo) * roundTo;
}
