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
  /** 未設定の食材名を表示するために使う。 */
  name: string;
  isPrepItem: boolean;
  /** 仕込み品の場合は使わない(値があっても無視される)。 */
  currentPurchasePrice: number;
  /**
   * 単価が入力済みかどうか。仕込み品の場合は使わない(材料の組み合わせから
   * 別途判定するため、値があっても無視される)。
   */
  priceIsSet: boolean;
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

/**
 * 食材ID→「単価が設定済みか」の対応表を作る。
 *
 * 通常の食材はpriceIsSetをそのまま使う。仕込み品は、自分のレシピの材料が
 * 1つでも未設定なら、仕込み品自体も未設定として扱う(入れ子も再帰的に判定)。
 * 循環参照は保険として「未設定」扱いにする(resolveEffectiveIngredientPricesが
 * 0円扱いにするのと同じ考え方)。
 */
export function resolveIngredientPriceStatus(
  ingredients: CostIngredient[],
  components: PrepItemComponentLine[],
): Map<string, boolean> {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const componentsByPrepItemId = new Map<string, PrepItemComponentLine[]>();
  for (const c of components) {
    const list = componentsByPrepItemId.get(c.prepItemId) ?? [];
    list.push(c);
    componentsByPrepItemId.set(c.prepItemId, list);
  }

  const resolved = new Map<string, boolean>();
  const resolving = new Set<string>();

  function resolve(id: string): boolean {
    const cached = resolved.get(id);
    if (cached != null) return cached;

    const ingredient = ingredientById.get(id);
    if (!ingredient) return false;

    if (!ingredient.isPrepItem) {
      resolved.set(id, ingredient.priceIsSet);
      return ingredient.priceIsSet;
    }

    if (resolving.has(id)) return false; // 循環参照の保険
    resolving.add(id);

    const lines = componentsByPrepItemId.get(id) ?? [];
    const isSet = lines.length > 0 && lines.every((line) => resolve(line.componentId));

    resolving.delete(id);
    resolved.set(id, isSet);
    return isSet;
  }

  for (const ingredient of ingredients) {
    resolve(ingredient.id);
  }

  return resolved;
}

export interface UnsetLeaf {
  /** 未設定の(末端の)食材名。 */
  name: string;
  /** その食材を直接使っている仕込み品の名前。メニューが直接使っている場合はnull。 */
  viaPrepItemName: string | null;
}

/**
 * 食材ID→「その食材(仕込み品なら入れ子の材料も含む)の中にある、単価未設定の
 * 末端食材の一覧」の対応表を作る。
 *
 * 表示ルール: 未設定の食材名には、それを直接使っている仕込み品の名前だけを
 * 添える(何段ネストしていても、一番近い親1つだけ)。メニューが仕込み品を
 * 介さず直接使っている食材が未設定の場合は、viaPrepItemNameはnullにする。
 */
export function resolveUnsetLeaves(
  ingredients: CostIngredient[],
  components: PrepItemComponentLine[],
): Map<string, UnsetLeaf[]> {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const componentsByPrepItemId = new Map<string, PrepItemComponentLine[]>();
  for (const c of components) {
    const list = componentsByPrepItemId.get(c.prepItemId) ?? [];
    list.push(c);
    componentsByPrepItemId.set(c.prepItemId, list);
  }

  const resolved = new Map<string, UnsetLeaf[]>();
  const resolving = new Set<string>();

  function resolve(id: string): UnsetLeaf[] {
    const cached = resolved.get(id);
    if (cached != null) return cached;

    const ingredient = ingredientById.get(id);
    if (!ingredient) return [];

    if (!ingredient.isPrepItem) {
      const leaves = ingredient.priceIsSet ? [] : [{ name: ingredient.name, viaPrepItemName: null }];
      resolved.set(id, leaves);
      return leaves;
    }

    if (resolving.has(id)) return []; // 循環参照の保険(通常は保存時に防止済み)
    resolving.add(id);

    const lines = componentsByPrepItemId.get(id) ?? [];
    const leaves: UnsetLeaf[] = [];
    for (const line of lines) {
      for (const leaf of resolve(line.componentId)) {
        // 一番近い親だけを残す: まだ親が付いていない(=直接の材料である)ものにだけ
        // 自分(この仕込み品)の名前を付ける。既に付いている場合はそのまま伝播する。
        leaves.push(leaf.viaPrepItemName == null ? { name: leaf.name, viaPrepItemName: ingredient.name } : leaf);
      }
    }

    resolving.delete(id);
    resolved.set(id, leaves);
    return leaves;
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
    name: string;
    currentPurchasePrice: number;
    priceIsSet: boolean;
    yieldRatePercent?: number | null;
    isPrepItem: boolean;
    yieldQuantity: number | null;
  },
>(ingredients: T[], components: PrepItemComponentLine[]): T[] {
  const resolvedPrices = resolveEffectiveIngredientPrices(ingredients, components);
  const resolvedStatus = resolveIngredientPriceStatus(ingredients, components);
  return ingredients.map((i) =>
    i.isPrepItem
      ? {
          ...i,
          currentPurchasePrice: resolvedPrices.get(i.id) ?? 0,
          priceIsSet: resolvedStatus.get(i.id) ?? false,
          yieldRatePercent: 100,
        }
      : i,
  );
}
