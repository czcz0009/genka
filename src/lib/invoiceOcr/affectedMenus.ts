/**
 * 完了画面「原価率が変わったメニュー」(2026-10-28)。テストは affectedMenus.test.ts(C-1〜C-8、Mahiro検算済み)。
 *
 * - 更新した食材を(仕込み品の中も含めて)使っているメニューだけを出す
 * - 原価の計算は、ほかの画面と同じ部品(costCalc.ts・prepItemCost.ts。歩留まり・仕込み品を含む)
 * - 原価率は小数第1位で出す。変化は、丸める前の値で計算してから小数第1位で出す
 * - 単価が未設定の食材があるメニューは、原価率を出さず「計算できていません(未設定: …)」で、一覧の最後
 * - 目標原価率(メニューごと、無ければ店の設定): 変わる前から超えていた →「超えています」、変わった後に超えた →「超えました」
 */
import { calcCostRate, calcEffectiveUnitPrice, calcMenuTotalCost, type UnitPriceMap } from "../costCalc.ts";
import { resolveUnsetLeaves, withResolvedPrepItemPrices, type PrepItemComponentLine } from "../prepItemCost.ts";

interface Ingredient {
  id: string;
  name: string;
  currentPurchasePrice: number;
  priceIsSet: boolean;
  yieldRatePercent: number;
  isPrepItem: boolean;
  yieldQuantity: number | null;
}

export interface AffectedMenu {
  menuId: string;
  name: string;
  beforeCost: number;
  afterCost: number;
  beforeRateText: string | null;
  afterRateText: string | null;
  changeText: string | null;
  /** 単価が未設定の食材があるとき「計算できていません(未設定: …)」 */
  unsetText: string | null;
  targetLabel: string | null;
  /** 並べ替え用(丸める前の変化。計算できないときは null) */
  changePoints: number | null;
}

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const fmtRate = (n: number) => `${round1(n).toFixed(1)}%`;
const fmtTarget = (n: number) => `${Number(n.toFixed(2))}%`;

function priceMap(ingredients: Ingredient[], components: PrepItemComponentLine[]): UnitPriceMap {
  return new Map(
    withResolvedPrepItemPrices(ingredients, components).map((i) => [
      i.id,
      { price: calcEffectiveUnitPrice(i.currentPurchasePrice, i.yieldRatePercent), isSet: i.priceIsSet },
    ]),
  );
}

export function affectedMenus(input: {
  menus: { id: string; name: string; sellingPrice: number | null; targetCostRate: number | null }[];
  ingredients: Ingredient[];
  menuIngredients: { menuId: string; ingredientId: string; quantity: number }[];
  prepItemComponents: PrepItemComponentLine[];
  updates: { ingredientId: string; newPrice: number }[];
  defaultTargetCostRate: number;
}): AffectedMenu[] {
  const updated = new Map(input.updates.map((u) => [u.ingredientId, u.newPrice]));
  if (updated.size === 0) return [];
  const after = input.ingredients.map((i) => (updated.has(i.id) ? { ...i, currentPurchasePrice: updated.get(i.id)!, priceIsSet: true } : i));
  const beforePrices = priceMap(input.ingredients, input.prepItemComponents);
  const afterPrices = priceMap(after, input.prepItemComponents);
  const unsetLeaves = resolveUnsetLeaves(after, input.prepItemComponents);

  // 仕込み品の中も含めて、更新した食材を使っているか
  const componentsOf = new Map<string, string[]>();
  for (const c of input.prepItemComponents) componentsOf.set(c.prepItemId, [...(componentsOf.get(c.prepItemId) ?? []), c.componentId]);
  const usesUpdated = (id: string, seen = new Set<string>()): boolean => {
    if (updated.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (componentsOf.get(id) ?? []).some((c) => usesUpdated(c, seen));
  };

  const out: AffectedMenu[] = [];
  for (const m of input.menus) {
    const lines = input.menuIngredients.filter((l) => l.menuId === m.id);
    if (!lines.some((l) => usesUpdated(l.ingredientId))) continue;
    const before = calcMenuTotalCost(lines, beforePrices);
    const afterCost = calcMenuTotalCost(lines, afterPrices);
    const beforeCost = round4(before.totalCost);
    const afterTotal = round4(afterCost.totalCost);

    if (afterCost.unsetIngredientIds.length > 0) {
      const names = [...new Set(afterCost.unsetIngredientIds.flatMap((id) => (unsetLeaves.get(id) ?? []).map((l) => l.name)))];
      out.push({
        menuId: m.id,
        name: m.name,
        beforeCost,
        afterCost: afterTotal,
        beforeRateText: null,
        afterRateText: null,
        changeText: null,
        unsetText: `計算できていません(未設定: ${names.join("・")})`,
        targetLabel: null,
        changePoints: null,
      });
      continue;
    }
    const beforeRate = before.unsetIngredientIds.length > 0 ? null : calcCostRate(before.totalCost, m.sellingPrice);
    const afterRate = calcCostRate(afterCost.totalCost, m.sellingPrice);
    if (afterRate == null) continue; // 売価が未設定(原価率を出せない)
    const change = beforeRate == null ? null : afterRate - beforeRate;
    if (change != null && round1(change) === 0 && afterTotal === beforeCost) continue; // 変わっていない
    const target = m.targetCostRate ?? input.defaultTargetCostRate;
    let targetLabel: string | null = null;
    if (beforeRate != null && beforeRate > target) targetLabel = `目標(${fmtTarget(target)})を超えています`;
    else if (afterRate > target) targetLabel = `目標(${fmtTarget(target)})を超えました`;
    out.push({
      menuId: m.id,
      name: m.name,
      beforeCost,
      afterCost: afterTotal,
      beforeRateText: beforeRate == null ? null : fmtRate(beforeRate),
      afterRateText: fmtRate(afterRate),
      changeText: change == null ? null : `${change < 0 ? "−" : "+"}${Math.abs(round1(change)).toFixed(1)}ポイント`,
      unsetText: null,
      targetLabel,
      changePoints: change,
    });
  }
  return out.sort((a, b) => {
    if (a.changePoints == null && b.changePoints == null) return 0;
    if (a.changePoints == null) return 1;
    if (b.changePoints == null) return -1;
    return Math.abs(b.changePoints) - Math.abs(a.changePoints);
  });
}
