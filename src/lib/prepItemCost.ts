/**
 * 仕込み品(サブレシピ)の単価解決・循環参照チェック。
 *
 * 仕込み品は「食材」テーブルの中の特殊な行(is_prep_item=true)として扱う。
 * 通常の食材と違い、仕入単価を直接持たず、自分のレシピ(prep_item_components)を
 * 材料費として合計し、1回の仕込みでできる量(yieldQuantity)で割った単価を
 * 都度その場で計算する。値を保存・キャッシュしないことで、元の食材価格が
 * 変わった時に再計算し忘れる、という事故を構造的に防いでいる。
 */
import { calcEffectiveUnitPrice } from "./costCalc.ts";

export interface CostIngredient {
  id: string;
  isPrepItem: boolean;
  /** 仕込み品の場合は使わない(値があっても無視される)。 */
  currentPurchasePrice: number;
  yieldRatePercent?: number | null;
  /** 仕込み品の場合のみ使う。1回の仕込みでできる量(ingredientsのunitと同じ単位)。 */
  yieldQuantity?: number | null;
}

export interface PrepItemComponentLine {
  prepItemId: string;
  /** 通常の食材、または別の仕込み品のID。 */
  componentId: string;
  quantity: number;
}

/**
 * 食材ID→実質単価(1単位あたり)の対応表を作る。
 *
 * 通常の食材は歩留まり調整済みの仕入単価をそのまま使う(従来通り)。
 * 仕込み品は、自分のレシピ(componentsで渡された明細)を再帰的にたどって
 * 原価を計算し、yieldQuantityで割った単価を使う。入れ子(仕込み品が別の
 * 仕込み品を含む)も再帰的に解決する。
 *
 * 循環参照がある場合は無限再帰を避けるため、循環している仕込み品の単価を
 * 0円として扱う(保存時のバリデーション(wouldCreateCycle)で通常は保存自体を
 * 防いでいるため、ここに到達するのは異常系に対する保険)。
 */
export function resolveEffectiveIngredientPrices(
  ingredients: CostIngredient[],
  components: PrepItemComponentLine[],
): Map<string, number> {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const componentsByPrepItemId = new Map<string, PrepItemComponentLine[]>();
  for (const c of components) {
    const list = componentsByPrepItemId.get(c.prepItemId) ?? [];
    list.push(c);
    componentsByPrepItemId.set(c.prepItemId, list);
  }

  const resolved = new Map<string, number>();
  const resolving = new Set<string>();

  function resolve(id: string): number {
    const cached = resolved.get(id);
    if (cached != null) return cached;

    const ingredient = ingredientById.get(id);
    if (!ingredient) return 0;

    if (!ingredient.isPrepItem) {
      const price = calcEffectiveUnitPrice(ingredient.currentPurchasePrice, ingredient.yieldRatePercent);
      resolved.set(id, price);
      return price;
    }

    if (resolving.has(id)) return 0; // 循環参照の保険(通常は保存時に防止済み)
    resolving.add(id);

    const lines = componentsByPrepItemId.get(id) ?? [];
    const totalCost = lines.reduce((sum, line) => sum + resolve(line.componentId) * line.quantity, 0);
    const yieldQuantity = ingredient.yieldQuantity;
    const price = yieldQuantity != null && yieldQuantity > 0 ? totalCost / yieldQuantity : 0;

    resolving.delete(id);
    resolved.set(id, price);
    return price;
  }

  for (const ingredient of ingredients) {
    resolve(ingredient.id);
  }

  return resolved;
}

export interface PrepItemEdge {
  prepItemId: string;
  componentId: string;
}

/**
 * 仕込み品prepItemIdのレシピにnewComponentIdsを追加(丸ごと置き換え)した場合、
 * 循環参照が発生するかどうかを判定する(保存前のバリデーション用)。
 *
 * existingEdgesには、保存しようとしている仕込み品自身の既存の行は含めず、
 * 店舗内の他の仕込み品どうしの参照関係だけを渡す想定(丸ごと置き換えのため)。
 */
export function wouldCreateCycle(
  prepItemId: string,
  newComponentIds: string[],
  existingEdges: PrepItemEdge[],
): boolean {
  const graph = new Map<string, string[]>();
  for (const e of existingEdges) {
    const list = graph.get(e.prepItemId) ?? [];
    list.push(e.componentId);
    graph.set(e.prepItemId, list);
  }
  graph.set(prepItemId, [...(graph.get(prepItemId) ?? []), ...newComponentIds]);

  // prepItemIdから辿って自分自身に戻ってこられるかをDFSで調べる。
  const visited = new Set<string>();
  function reachesSelf(nodeId: string): boolean {
    if (nodeId === prepItemId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    for (const next of graph.get(nodeId) ?? []) {
      if (reachesSelf(next)) return true;
    }
    return false;
  }

  return newComponentIds.some((componentId) => reachesSelf(componentId));
}

/**
 * RankingIngredient・AlertIngredient・IngredientOption等、「食材ID・仕入単価・
 * 歩留まり率」を持つ配列を受け取り、仕込み品の行だけcurrentPurchasePriceを
 * 「レシピから計算した実質単価」に、yieldRatePercentを100に差し替えて返す
 * (歩留まり調整はレシピ内の食材側で既に反映済みのため、二重適用を避ける)。
 * 通常の食材の行はそのまま返すため、呼び出し側の既存の計算ロジック
 * (calcEffectiveUnitPrice等)は変更しなくてよい。
 *
 * 呼び出し側であらかじめcurrentPurchasePriceを別の値(例: 過去時点の履歴価格)に
 * 差し替えてから渡せば、その値を材料費として仕込み品の計算に使う
 * (「今見直すべきメニュー」画面の月次再現などに使える)。
 */
export function withResolvedPrepItemPrices<
  T extends {
    id: string;
    currentPurchasePrice: number;
    yieldRatePercent?: number | null;
    isPrepItem: boolean;
    yieldQuantity: number | null;
  },
>(ingredients: T[], components: PrepItemComponentLine[]): T[] {
  const resolved = resolveEffectiveIngredientPrices(ingredients, components);
  return ingredients.map((i) =>
    i.isPrepItem ? { ...i, currentPurchasePrice: resolved.get(i.id) ?? 0, yieldRatePercent: 100 } : i,
  );
}
