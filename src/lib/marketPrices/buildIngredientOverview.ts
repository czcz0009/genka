/**
 * 「登録済み食材とその現在の市場価格・追跡状況の一覧」(/alerts画面)を組み立てる。
 *
 * 目的: 従来のアラート機能は「閾値を超える変動があった食材だけ」を通知する設計で、
 * 店主からすると「今登録している食材が、そもそも追跡対象になっているのか」
 * 「対象なら今の相場はどうなっているのか」を普段確認する場所が無かった。
 * この関数は登録済みの食材1件ごとに、以下のいずれかの状態を判定する。
 *
 * - tracked: 青果物として確信度highで一致 / 畜産物として規格を確定済み
 *            → 直近の市場価格・前回比の変動率を表示する
 * - needsReview: 青果物として一致した候補はあるが、確信度lowの推測一致
 *            (bigram類似度によるフォールバック)。誤対応のリスクがあるため
 *            「推測・未確認」と明示した上で価格を参考表示する
 * - needsSetup: 畜産物(豚/牛/鶏)らしいと判定できたが、どの規格の価格と
 *            比較すべきかまだ店主が確定していない(/alerts画面下部の設定が必要)
 * - untracked: 青果物・畜産物のいずれの相場データにも対応が見つからなかった
 *            (国のデータ自体に無い食材、または表記が大きく異なる)
 */
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import type { IngredientItemMatch } from "./matchIngredientToItem.ts";

export type IngredientTrackingStatus = "tracked" | "needsReview" | "needsSetup" | "untracked";
export type IngredientTrackingCategory = "produce" | "livestock";

export interface IngredientOverviewRow {
  ingredientId: string;
  ingredientName: string;
  status: IngredientTrackingStatus;
  category: IngredientTrackingCategory | null;
  /** 一致した市場品目・規格の名前(未追跡なら null) */
  itemName: string | null;
  /** 直近の卸売価格(円/kg)。データが無ければ null */
  currentPricePerKg: number | null;
  /** 前回(前旬・前月)比の変動率(%)。比較できるデータが無ければ null */
  changePercent: number | null;
  direction: "up" | "down" | "flat" | null;
}

export interface LinkedLivestockIngredient {
  id: string;
  itemCode: string;
  itemLabel: string;
}

export interface BuildIngredientOverviewInput {
  ingredients: { id: string; name: string }[];
  /** matchIngredientsToItems の結果(確信度high/lowどちらも含む、全件) */
  produceMatches: IngredientItemMatch[];
  produceCurrent: SyuyoItem[];
  producePrevious: SyuyoItem[];
  /** 畜産物の規格を確定済みの食材 */
  linkedLivestock: LinkedLivestockIngredient[];
  /** 畜産物らしいと判定されたが未確定の食材のid */
  livestockCandidateIds: string[];
  livestockCurrent: SyuyoItem[];
  livestockPrevious: SyuyoItem[];
}

function priceByItemCode(items: SyuyoItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.isBreakdownRow) continue;
    if (item.pricePerKg == null) continue;
    map.set(item.itemCode, item.pricePerKg);
  }
  return map;
}

function computePriceInfo(
  itemCode: string,
  currentByCode: Map<string, number>,
  previousByCode: Map<string, number>,
): Pick<IngredientOverviewRow, "currentPricePerKg" | "changePercent" | "direction"> {
  const currentPricePerKg = currentByCode.get(itemCode) ?? null;
  const previousPricePerKg = previousByCode.get(itemCode) ?? null;
  if (currentPricePerKg == null || previousPricePerKg == null || previousPricePerKg === 0) {
    return { currentPricePerKg, changePercent: null, direction: null };
  }
  const changePercent = ((currentPricePerKg - previousPricePerKg) / previousPricePerKg) * 100;
  const direction = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat";
  return { currentPricePerKg, changePercent, direction };
}

export function buildIngredientOverview(input: BuildIngredientOverviewInput): IngredientOverviewRow[] {
  const {
    ingredients,
    produceMatches,
    produceCurrent,
    producePrevious,
    linkedLivestock,
    livestockCandidateIds,
    livestockCurrent,
    livestockPrevious,
  } = input;

  const produceMatchByIngredientId = new Map(produceMatches.map((m) => [m.ingredientId, m]));
  const produceCurrentByCode = priceByItemCode(produceCurrent);
  const producePreviousByCode = priceByItemCode(producePrevious);

  const linkedByIngredientId = new Map(linkedLivestock.map((l) => [l.id, l]));
  const livestockCandidateIdSet = new Set(livestockCandidateIds);
  const livestockCurrentByCode = priceByItemCode(livestockCurrent);
  const livestockPreviousByCode = priceByItemCode(livestockPrevious);

  return ingredients.map((ingredient): IngredientOverviewRow => {
    // 1. 青果物として一致(確信度high/lowどちらも)していれば優先してそちらを採用する
    const produceMatch = produceMatchByIngredientId.get(ingredient.id);
    if (produceMatch) {
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        status: produceMatch.confidence === "high" ? "tracked" : "needsReview",
        category: "produce",
        itemName: produceMatch.itemName,
        ...computePriceInfo(produceMatch.itemCode, produceCurrentByCode, producePreviousByCode),
      };
    }

    // 2. 畜産物として規格確定済みか
    const linked = linkedByIngredientId.get(ingredient.id);
    if (linked) {
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        status: "tracked",
        category: "livestock",
        itemName: linked.itemLabel,
        ...computePriceInfo(linked.itemCode, livestockCurrentByCode, livestockPreviousByCode),
      };
    }

    // 3. 畜産物らしいが規格未確定
    if (livestockCandidateIdSet.has(ingredient.id)) {
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        status: "needsSetup",
        category: "livestock",
        itemName: null,
        currentPricePerKg: null,
        changePercent: null,
        direction: null,
      };
    }

    // 4. どちらにも該当なし
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      status: "untracked",
      category: null,
      itemName: null,
      currentPricePerKg: null,
      changePercent: null,
      direction: null,
    };
  });
}
