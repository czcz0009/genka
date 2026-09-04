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
import { calcMenuTotalCost, calcCostRate, type UnitPriceMap } from "../costCalc.ts";

export interface AlertIngredient {
  id: string;
  name: string;
  currentPurchasePrice: number;
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
    .map((m) => `${m.menuName}(原価率${formatRate(m.oldCostRate)}→${formatRate(m.projectedCostRate)}、試算)`)
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
}

export interface GenerateAlertsResult {
  alerts: MarketPriceAlert[];
  /** 確信度lowだったため通知を見送った、要確認のマッチ候補 */
  needsReviewMatches: IngredientItemMatch[];
}

export function generateMarketPriceAlerts(input: GenerateAlertsInput): GenerateAlertsResult {
  const { priceChanges, matches, ingredients, menus, menuIngredients, defaultTargetCostRate } = input;

  const priceChangeByItemCode = new Map(priceChanges.map((e) => [e.itemCode, e]));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const menuIngredientsByIngredientId = new Map<string, AlertMenuIngredient[]>();
  for (const mi of menuIngredients) {
    const list = menuIngredientsByIngredientId.get(mi.ingredientId) ?? [];
    list.push(mi);
    menuIngredientsByIngredientId.set(mi.ingredientId, list);
  }
  // メニューごとの現在の仕入単価マップ(原価計算に必要)
  const currentUnitPrices: UnitPriceMap = new Map(ingredients.map((i) => [i.id, i.currentPurchasePrice]));

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
    projectedUnitPrices.set(
      ingredient.id,
      ingredient.currentPurchasePrice * (1 + priceChange.changePercent / 100),
    );

    const affectedMenus: AffectedMenu[] = affectedMenuIds
      .map((menuId) => {
        const menu = menuById.get(menuId);
        if (!menu) return null;
        const lines = menuIngredients.filter((mi) => mi.menuId === menuId);
        const oldCost = calcMenuTotalCost(lines, currentUnitPrices);
        const projectedCost = calcMenuTotalCost(lines, projectedUnitPrices);
        const oldCostRate = calcCostRate(oldCost, menu.sellingPrice);
        const projectedCostRate = calcCostRate(projectedCost, menu.sellingPrice);
        const targetCostRate = menu.targetCostRate ?? defaultTargetCostRate;
        const newlyOverTarget =
          projectedCostRate != null &&
          projectedCostRate > targetCostRate &&
          (oldCostRate == null || oldCostRate <= targetCostRate);
        return {
          menuId,
          menuName: menu.name,
          oldCostRate,
          projectedCostRate,
          targetCostRate,
          newlyOverTarget,
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
