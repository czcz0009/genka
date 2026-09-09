import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPriceChanges } from "./detectPriceChanges.ts";
import { matchIngredientsToItems } from "./matchIngredientToItem.ts";
import { generateMarketPriceAlerts, type AlertIngredient, type AlertMenu, type AlertMenuIngredient } from "./generateAlerts.ts";
import { confirmedLinksToMatches } from "./livestock/confirmedLinksToMatches.ts";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "./livestock/chikusanColumns.ts";
import { suggestChikusanItems } from "./livestock/suggestChikusanItem.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

/**
 * 仕入れ値変動アラートの算出(/alerts画面と、ホームのダッシュボード要約の両方から使う)。
 *
 * 注意: market_price_observations / livestock_price_observations の全期間データを
 * 都度取得する設計になっており、呼び出すたびにそれなりのクエリコストがかかる
 * (/alertsだけでなくホームからも呼ぶと、その分アクセス頻度が増える)。
 * パフォーマンス改善(直近2期分だけをDB側で絞り込む等)は別途の課題として残っている。
 */

/** period_year/month(/third) の組み合わせをキー化する */
function periodKey(row: { period_year: number; period_month: number; period_third?: number | null }): number {
  return row.period_year * 10000 + row.period_month * 100 + (row.period_third ?? 0);
}

export interface StoreAlertsResult {
  produceAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"];
  produceNeedsReview: ReturnType<typeof generateMarketPriceAlerts>["needsReviewMatches"];
  livestockAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"];
  hasProduceComparison: boolean;
  hasLivestockComparison: boolean;
  unlinkedIngredients: { id: string; name: string; suggestions: ReturnType<typeof suggestChikusanItems> }[];
  linkedIngredients: { id: string; name: string; itemCode: ChikusanItemCode; itemLabel: string }[];
}

export async function computeStoreAlerts(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
  alertIngredients: AlertIngredient[],
  alertMenus: AlertMenu[],
  alertMenuIngredients: AlertMenuIngredient[],
): Promise<StoreAlertsResult> {
  const [{ data: produceObservations }, { data: livestockObservations }, { data: links }] = await Promise.all([
    supabase
      .from("market_price_observations")
      .select("item_code, item_name, period_year, period_month, period_third, price_per_kg")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("period_third", { ascending: false })
      .limit(1200),
    supabase
      .from("livestock_price_observations")
      .select("item_code, item_name, period_year, period_month, price_per_kg")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(200),
    supabase.from("ingredient_market_links").select("ingredient_id, item_code").eq("source", "chikusan"),
  ]);

  // --- 青果物: 直近2期分の観測データから前期比較する ---
  const produceKeys = Array.from(new Set((produceObservations ?? []).map(periodKey))).sort((a, b) => b - a);
  const produceCurrentKey = produceKeys[0];
  const producePreviousKey = produceKeys[1];
  const produceCurrentItems: SyuyoItem[] = (produceObservations ?? [])
    .filter((r) => periodKey(r) === produceCurrentKey)
    .map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      isBreakdownRow: false,
      wholesaleQuantityTon: null,
      wholesaleValueThousandYen: null,
      pricePerKg: r.price_per_kg,
      yoyQuantityPercent: null,
      yoyPricePercent: null,
      prevThirdQuantityPercent: null,
      prevThirdPricePercent: null,
    }));
  const producePreviousItems: SyuyoItem[] = (produceObservations ?? [])
    .filter((r) => periodKey(r) === producePreviousKey)
    .map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      isBreakdownRow: false,
      wholesaleQuantityTon: null,
      wholesaleValueThousandYen: null,
      pricePerKg: r.price_per_kg,
      yoyQuantityPercent: null,
      yoyPricePercent: null,
      prevThirdQuantityPercent: null,
      prevThirdPricePercent: null,
    }));

  let produceAlerts: StoreAlertsResult["produceAlerts"] = [];
  let produceNeedsReview: StoreAlertsResult["produceNeedsReview"] = [];
  if (producePreviousKey != null) {
    const produceChanges = detectPriceChanges(produceCurrentItems, producePreviousItems);
    const produceMatches = matchIngredientsToItems(
      alertIngredients.map((i) => ({ id: i.id, name: i.name })),
      produceCurrentItems,
    );
    const result = generateMarketPriceAlerts({
      priceChanges: produceChanges,
      matches: produceMatches,
      ingredients: alertIngredients,
      menus: alertMenus,
      menuIngredients: alertMenuIngredients,
      defaultTargetCostRate: store.defaultTargetCostRate,
    });
    produceAlerts = result.alerts;
    produceNeedsReview = result.needsReviewMatches;
  }

  // --- 畜産物: 直近2ヶ月分の観測データから前月比較する。マッチングは確定リンクのみ ---
  const livestockKeys = Array.from(new Set((livestockObservations ?? []).map(periodKey))).sort((a, b) => b - a);
  const livestockCurrentKey = livestockKeys[0];
  const livestockPreviousKey = livestockKeys[1];
  const toLivestockItem = (r: { item_code: string; item_name: string; price_per_kg: number | null }): SyuyoItem => ({
    itemCode: r.item_code,
    itemName: r.item_name,
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg: r.price_per_kg,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
  });
  const livestockCurrentItems = (livestockObservations ?? [])
    .filter((r) => periodKey(r) === livestockCurrentKey)
    .map(toLivestockItem);
  const livestockPreviousItems = (livestockObservations ?? [])
    .filter((r) => periodKey(r) === livestockPreviousKey)
    .map(toLivestockItem);

  const linkByIngredientId = new Map((links ?? []).map((l) => [l.ingredient_id, l.item_code as ChikusanItemCode]));
  const confirmedLinks = alertIngredients
    .filter((i) => linkByIngredientId.has(i.id))
    .map((i) => ({ ingredientId: i.id, ingredientName: i.name, itemCode: linkByIngredientId.get(i.id)! }));

  let livestockAlerts: StoreAlertsResult["livestockAlerts"] = [];
  if (livestockPreviousKey != null && confirmedLinks.length > 0) {
    const livestockChanges = detectPriceChanges(livestockCurrentItems, livestockPreviousItems);
    const livestockMatches = confirmedLinksToMatches(confirmedLinks);
    const result = generateMarketPriceAlerts({
      priceChanges: livestockChanges,
      matches: livestockMatches,
      ingredients: alertIngredients,
      menus: alertMenus,
      menuIngredients: alertMenuIngredients,
      defaultTargetCostRate: store.defaultTargetCostRate,
    });
    livestockAlerts = result.alerts;
  }

  const unlinkedIngredients = alertIngredients
    .filter((i) => !linkByIngredientId.has(i.id))
    .map((i) => ({ id: i.id, name: i.name, suggestions: suggestChikusanItems(i.name).slice(0, 3) }));
  const linkedIngredients = alertIngredients
    .filter((i) => linkByIngredientId.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      itemCode: linkByIngredientId.get(i.id)!,
      itemLabel: CHIKUSAN_COLUMNS.find((c) => c.itemCode === linkByIngredientId.get(i.id))?.label ?? "",
    }));

  return {
    produceAlerts,
    produceNeedsReview,
    livestockAlerts,
    hasProduceComparison: producePreviousKey != null,
    hasLivestockComparison: livestockPreviousKey != null,
    unlinkedIngredients,
    linkedIngredients,
  };
}
