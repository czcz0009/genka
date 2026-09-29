/**
 * 市場価格の変動(detectPriceChanges)と食材マッチング(matchIngredientToItem)の結果から、
 * 「◯◯が値上がりしました。影響メニュー:△△(原価率32%→37%)」という通知内容を組み立てる。
 *
 * 重要な前提: ここで計算する「新しい原価率」は、店主が実際に仕入単価を変更した結果
 * ではなく、「卸売市場の変動率がそのまま店主の仕入単価にも反映されたと仮定した場合」の
 * 試算値。仕入契約は市場と連動するとは限らないため、通知文でも「試算」であることを
 * 明示し、確定した数値であるかのように断定しない。
 *
 * また、食材マッチングの確信度が low(bigram類似度によるフォールバック)の場合は
 * 誤った食材と結びつけて通知してしまうリスクがあるため、確信度 high のマッチのみを
 * 通知対象にする。low の候補は別途「確認候補」として返し、通知は生成しない。
 */
import type { PriceChangeEvent } from "./detectPriceChanges.ts";
import type { IngredientItemMatch } from "./matchIngredientToItem.ts";
import { calcMenuTotalCost, calcCostRate, calcEffectiveUnitPrice, type UnitPriceMap } from "../costCalc.ts";
import type { UnsetLeaf } from "../prepItemCost.ts";

export interface AlertIngredient {
  id: string;
  name: string;
  currentPurchasePrice: number;
  /** 単価が入力済みかどうか。falseなら未設定。 */
  priceIsSet: boolean;
  /** 歩留まり率(%)。未指定・100なら仕入単価をそのまま使う(従来通り)。 */
  yieldRatePercent?: number | null;
}

export interface AlertMenu {
  id: string;
  name: string;
  sellingPrice: number | null;
  /** null なら defaultTargetCostRate を使う */
  targetCostRate: number | null;
}

export interface AlertMenuIngredient {
  menuId: string;
  ingredientId: string;
  quantity: number;
}

export interface AffectedMenu {
  menuId: string;
  menuName: string;
  oldCostRate: number | null;
  /** 市場価格の変動率をそのまま適用したと仮定した場合の試算原価率 */
  projectedCostRate: number | null;
  targetCostRate: number;
  /** 目標原価率を超えていなかったが、試算では超える見込みになった */
  newlyOverTarget: boolean;
  /** 単価未設定の食材(仕込み品の材料含む)を使っているため、試算原価率を出せない */
  hasUnsetIngredient: boolean;
  unsetIngredientNames: string[];
}

export interface MarketPriceAlert {
  ingredientId: string;
  ingredientName: string;
  itemName: string;
  changePercent: number;
  direction: "up" | "down";
  affectedMenus: AffectedMenu[];
  message: string;
}

function formatRate(rate: number | null): string {
  return rate == null ? "-" : `${Math.round(rate)}%`;
}

function buildMessage(alert: Omit<MarketPriceAlert, "message">): string {
  const verb = alert.direction === "up" ? "値上がり" : "値下がり";
  const sign = alert.direction === "up" ? "+" : "";
  const header = `${alert.ingredientName}(市場価格「${alert.itemName}」)が${verb}しました(${sign}${Math.round(
    alert.changePercent,
  )}%)。`;
  if (alert.affectedMenus.length === 0) {
    return `${header}このメニューを使うメニューは登録されていません。`;
  }
  const menuText = alert.affectedMenus
    .map((m) =>
      m.hasUnsetIngredient
        ? `${m.menuName}(計算できていません)`
        : `${m.menuName}(原価率${formatRate(m.oldCostRate)}→${formatRate(m.projectedCostRate)}、試算)`,
    )
    .join("、");
  return `${header}影響メニュー:${menuText}`;
}

export interface GenerateAlertsInput {
  priceChanges: PriceChangeEvent[];
  matches: IngredientItemMatch[];
  ingredients: AlertIngredient[];
  menus: AlertMenu[];
  menuIngredients: AlertMenuIngredient[];
  defaultTargetCostRate: number;
  /** 食材ID→単価未設定の末端食材一覧(prepItemCost.tsのresolveUnsetLeaves)。 */
  unsetLeavesByIngredientId?: Map<string, UnsetLeaf[]>;
}

export interface GenerateAlertsResult {
  alerts: MarketPriceAlert[];
  /** 確信度lowだったため通知を見送った、要確認のマッチ候補 */
  needsReviewMatches: IngredientItemMatch[];
}

export function generateMarketPriceAlerts(input: GenerateAlertsInput): GenerateAlertsResult {
  const { priceChanges, matches, ingredients, menus, menuIngredients, defaultTargetCostRate, unsetLeavesByIngredientId } =
    input;

  const priceChangeByItemCode = new Map(priceChanges.map((e) => [e.itemCode, e]));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const menuIngredientsByIngredientId = new Map<string, AlertMenuIngredient[]>();
  for (const mi of menuIngredients) {
    const list = menuIngredientsByIngredientId.get(mi.ingredientId) ?? [];
    list.push(mi);
    menuIngredientsByIngredientId.set(mi.ingredientId, list);
  }
  // メニューごとの現在の仕入単価マップ(原価計算に必要)。歩留まり率を考慮した実質単価を使う。
  const currentUnitPrices: UnitPriceMap = new Map(
    ingredients.map((i) => [
      i.id,
      { price: calcEffectiveUnitPrice(i.currentPurchasePrice, i.yieldRatePercent), isSet: i.priceIsSet },
    ]),
  );

  const alerts: MarketPriceAlert[] = [];
  const needsReviewMatches: IngredientItemMatch[] = [];

  for (const match of matches) {
    if (match.confidence === "low") {
      needsReviewMatches.push(match);
      continue;
    }

    const priceChange = priceChangeByItemCode.get(match.itemCode);
    if (!priceChange) continue; // この食材の品目は今回、閾値を超える変動がなかった

    const ingredient = ingredientById.get(match.ingredientId);
    if (!ingredient) continue;

    const affectedLines = menuIngredientsByIngredientId.get(ingredient.id) ?? [];
    const affectedMenuIds = Array.from(new Set(affectedLines.map((l) => l.menuId)));

    const projectedUnitPrices: UnitPriceMap = new Map(currentUnitPrices);
    const projectedPurchasePrice = ingredient.currentPurchasePrice * (1 + priceChange.changePercent / 100);
    projectedUnitPrices.set(ingredient.id, {
      price: calcEffectiveUnitPrice(projectedPurchasePrice, ingredient.yieldRatePercent),
      isSet: ingredient.priceIsSet,
    });

    const affectedMenus: AffectedMenu[] = affectedMenuIds
      .map((menuId) => {
        const menu = menuById.get(menuId);
        if (!menu) return null;
        const lines = menuIngredients.filter((mi) => mi.menuId === menuId);
        const oldResult = calcMenuTotalCost(lines, currentUnitPrices);
        const projectedResult = calcMenuTotalCost(lines, projectedUnitPrices);
        const hasUnsetIngredient = oldResult.unsetIngredientIds.length > 0;
        const oldCostRate = hasUnsetIngredient ? null : calcCostRate(oldResult.totalCost, menu.sellingPrice);
        const projectedCostRate = hasUnsetIngredient ? null : calcCostRate(projectedResult.totalCost, menu.sellingPrice);
        const targetCostRate = menu.targetCostRate ?? defaultTargetCostRate;
        const newlyOverTarget =
          projectedCostRate != null &&
          projectedCostRate > targetCostRate &&
          (oldCostRate == null || oldCostRate <= targetCostRate);
        const seen = new Set<string>();
        const unsetIngredientNames: string[] = [];
        for (const id of oldResult.unsetIngredientIds) {
          for (const leaf of unsetLeavesByIngredientId?.get(id) ?? []) {
            const label = leaf.viaPrepItemName ? `${leaf.name}(${leaf.viaPrepItemName}の材料)` : leaf.name;
            if (seen.has(label)) continue;
            seen.add(label);
            unsetIngredientNames.push(label);
          }
        }
        return {
          menuId,
          menuName: menu.name,
          oldCostRate,
          projectedCostRate,
          targetCostRate,
          newlyOverTarget,
          hasUnsetIngredient,
          unsetIngredientNames,
        };
      })
      .filter((m): m is AffectedMenu => m != null);

    const alertWithoutMessage = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      itemName: match.itemName,
      changePercent: priceChange.changePercent,
      direction: priceChange.direction,
      affectedMenus,
    };
    alerts.push({ ...alertWithoutMessage, message: buildMessage(alertWithoutMessage) });
  }

  return { alerts, needsReviewMatches };
}
