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
 *            (bigram類似度によるフォールバック、または紛らわしい名前)。誤対応のリスクがあるため
 *            候補の名前だけを出し、価格・前回比は出さない(2026-10-22に変更。以前は参考表示していた)
 * - needsSetup: 畜産物(豚/牛/鶏)らしいと判定できたが、どの規格の価格と
 *            比較すべきかまだ店主が確定していない(/alerts画面下部の設定が必要)
 * - untracked: 青果物・畜産物のいずれの相場データにも対応が見つからなかった
 *            (国のデータ自体に無い食材、または表記が大きく異なる)
 * - excluded: 利用者が「市場価格と比べない」にした(産直・契約農家など。2026-10-22に追加)
 */
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import type { IngredientItemMatch } from "./matchIngredientToItem.ts";

export type IngredientTrackingStatus = "tracked" | "needsReview" | "needsSetup" | "untracked" | "excluded";
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
  /** 野菜・果物の品目コード(「合っている」と確定させるボタン用)。それ以外は null */
  produceItemCode: string | null;
  /**
   * 利用者の設定。confirmed=野菜・果物を「合っている」と確定した / excluded=「比べない」にした /
   * null=自動の判定(辞書・推定)か、食肉の紐づけ(食肉の紐づけは下の設定欄で解除する)
   */
  userSetting: "confirmed" | "excluded" | null;
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
  /** 利用者が確定した紐づけ(userMarketLinks.ts)。「比べない」と、野菜・果物の確定の表示に使う */
  userLinks?: { ingredientId: string; source: string; itemCode: string | null }[];
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
    userLinks = [],
  } = input;

  const produceMatchByIngredientId = new Map(produceMatches.map((m) => [m.ingredientId, m]));
  const produceCurrentByCode = priceByItemCode(produceCurrent);
  const producePreviousByCode = priceByItemCode(producePrevious);

  const linkedByIngredientId = new Map(linkedLivestock.map((l) => [l.id, l]));
  const livestockCandidateIdSet = new Set(livestockCandidateIds);
  const livestockCurrentByCode = priceByItemCode(livestockCurrent);
  const livestockPreviousByCode = priceByItemCode(livestockPrevious);
  const userLinkByIngredientId = new Map(userLinks.map((l) => [l.ingredientId, l]));

  return ingredients.map((ingredient): IngredientOverviewRow => {
    const base = { ingredientId: ingredient.id, ingredientName: ingredient.name };
    const noPrice = { currentPricePerKg: null, changePercent: null, direction: null };
    const userLink = userLinkByIngredientId.get(ingredient.id);

    // 1. 利用者が確定した紐づけを、辞書との一致や自動の推定より常に優先する(2026-10-22)。
    //    以前は青果物の推定を先に見ていたため、「鶏もも肉」を鶏肉ももに紐づけても、桃の価格が出ていた。
    if (userLink?.source === "excluded") {
      return { ...base, status: "excluded", category: null, itemName: null, ...noPrice, produceItemCode: null, userSetting: "excluded" };
    }
    const linked = linkedByIngredientId.get(ingredient.id);
    if (linked) {
      return {
        ...base,
        status: "tracked",
        category: "livestock",
        itemName: linked.itemLabel,
        ...computePriceInfo(linked.itemCode, livestockCurrentByCode, livestockPreviousByCode),
        produceItemCode: null,
        userSetting: null,
      };
    }

    // 2. 青果物として一致(利用者の確定、辞書との一致、推定)。確信度highなら価格・前回比を出す。
    //    推定(確信度low)は、別の品目の値動きを誤って見せないよう、候補の名前だけを出す(価格・前回比は出さない)。
    const produceMatch = produceMatchByIngredientId.get(ingredient.id);
    if (produceMatch) {
      const confirmed = produceMatch.confidence === "high";
      return {
        ...base,
        status: confirmed ? "tracked" : "needsReview",
        category: "produce",
        itemName: produceMatch.itemName,
        ...(confirmed ? computePriceInfo(produceMatch.itemCode, produceCurrentByCode, producePreviousByCode) : noPrice),
        produceItemCode: produceMatch.itemCode,
        userSetting: userLink?.source === "syuyo" ? "confirmed" : null,
      };
    }

    // 3. 畜産物らしいが規格未確定
    if (livestockCandidateIdSet.has(ingredient.id)) {
      return { ...base, status: "needsSetup", category: "livestock", itemName: null, ...noPrice, produceItemCode: null, userSetting: null };
    }

    // 4. どちらにも該当なし
    return { ...base, status: "untracked", category: null, itemName: null, ...noPrice, produceItemCode: null, userSetting: null };
  });
}
