import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPriceChanges } from "./detectPriceChanges.ts";
import { matchIngredientsToItems } from "./matchIngredientToItem.ts";
import { generateMarketPriceAlerts, type AlertIngredient, type AlertMenu, type AlertMenuIngredient } from "./generateAlerts.ts";
import { confirmedLinksToMatches } from "./livestock/confirmedLinksToMatches.ts";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "./livestock/chikusanColumns.ts";
import { suggestChikusanItems } from "./livestock/suggestChikusanItem.ts";
import { previousPeriod, type Period } from "./period.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

/**
 * 仕入れ値変動アラートの算出(/alerts画面と、ホームのダッシュボード要約の両方から使う)。
 *
 * パフォーマンス上の注意点(優先度3で対応済み):
 * 以前は market_price_observations を最大1200行・livestock_price_observations を
 * 最大200行、期間を問わず一律の件数上限で取得していた。品目数が増えたり観測データが
 * 蓄積するほど「直近2期分のつもりが実は3期目まで混ざる」「逆に1200行に収まらず
 * 直近2期目が切り捨てられる」といった不正確さと無駄取得の両方のリスクがあったため、
 * 「まず最新の観測日を1行だけ調べる→その期・前期の2期分だけをWHEREで絞り込んで取得する」
 * 方式に変更した。取得件数は常に「その2期分に実際に存在する行数」ぴったりになる。
 */

export interface StoreAlertsResult {
  produceAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"];
  produceNeedsReview: ReturnType<typeof generateMarketPriceAlerts>["needsReviewMatches"];
  livestockAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"];
  hasProduceComparison: boolean;
  hasLivestockComparison: boolean;
  unlinkedIngredients: { id: string; name: string; suggestions: ReturnType<typeof suggestChikusanItems> }[];
  linkedIngredients: { id: string; name: string; itemCode: ChikusanItemCode; itemLabel: string }[];
}

function toSyuyoItem(r: { item_code: string; item_name: string; price_per_kg: number | null }): SyuyoItem {
  return {
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
  };
}

/** 青果物(旬別)の直近2期分だけをDB側で絞り込んで取得する */
async function fetchRecentProduceObservations(
  supabase: SupabaseClient,
): Promise<{ current: SyuyoItem[]; previous: SyuyoItem[]; hasComparison: boolean }> {
  const { data: latest } = await supabase
    .from("market_price_observations")
    .select("period_year, period_month, period_third")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("period_third", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { current: [], previous: [], hasComparison: false };

  const cur: Period = { year: latest.period_year, month: latest.period_month, third: latest.period_third as 1 | 2 | 3 };
  const prev = previousPeriod(cur);

  const { data: rows } = await supabase
    .from("market_price_observations")
    .select("item_code, item_name, period_year, period_month, period_third, price_per_kg")
    .or(
      `and(period_year.eq.${cur.year},period_month.eq.${cur.month},period_third.eq.${cur.third}),and(period_year.eq.${prev.year},period_month.eq.${prev.month},period_third.eq.${prev.third})`,
    );

  const current = (rows ?? [])
    .filter((r) => r.period_year === cur.year && r.period_month === cur.month && r.period_third === cur.third)
    .map(toSyuyoItem);
  const previous = (rows ?? [])
    .filter((r) => r.period_year === prev.year && r.period_month === prev.month && r.period_third === prev.third)
    .map(toSyuyoItem);
  return { current, previous, hasComparison: previous.length > 0 };
}

/** 畜産物(月別)の直近2ヶ月分だけをDB側で絞り込んで取得する */
async function fetchRecentLivestockObservations(
  supabase: SupabaseClient,
): Promise<{ current: SyuyoItem[]; previous: SyuyoItem[]; hasComparison: boolean }> {
  const { data: latest } = await supabase
    .from("livestock_price_observations")
    .select("period_year, period_month")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { current: [], previous: [], hasComparison: false };

  const curY = latest.period_year;
  const curM = latest.period_month;
  const prevY = curM > 1 ? curY : curY - 1;
  const prevM = curM > 1 ? curM - 1 : 12;

  const { data: rows } = await supabase
    .from("livestock_price_observations")
    .select("item_code, item_name, period_year, period_month, price_per_kg")
    .or(`and(period_year.eq.${curY},period_month.eq.${curM}),and(period_year.eq.${prevY},period_month.eq.${prevM})`);

  const current = (rows ?? []).filter((r) => r.period_year === curY && r.period_month === curM).map(toSyuyoItem);
  const previous = (rows ?? []).filter((r) => r.period_year === prevY && r.period_month === prevM).map(toSyuyoItem);
  return { current, previous, hasComparison: previous.length > 0 };
}

export async function computeStoreAlerts(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
  alertIngredients: AlertIngredient[],
  alertMenus: AlertMenu[],
  alertMenuIngredients: AlertMenuIngredient[],
): Promise<StoreAlertsResult> {
  const [produce, livestock, { data: links }] = await Promise.all([
    fetchRecentProduceObservations(supabase),
    fetchRecentLivestockObservations(supabase),
    supabase.from("ingredient_market_links").select("ingredient_id, item_code").eq("source", "chikusan"),
  ]);

  // --- 青果物: 直近2期分の観測データから前期比較する ---
  let produceAlerts: StoreAlertsResult["produceAlerts"] = [];
  let produceNeedsReview: StoreAlertsResult["produceNeedsReview"] = [];
  if (produce.hasComparison) {
    const produceChanges = detectPriceChanges(produce.current, produce.previous);
    const produceMatches = matchIngredientsToItems(
      alertIngredients.map((i) => ({ id: i.id, name: i.name })),
      produce.current,
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
  const linkByIngredientId = new Map((links ?? []).map((l) => [l.ingredient_id, l.item_code as ChikusanItemCode]));
  const confirmedLinks = alertIngredients
    .filter((i) => linkByIngredientId.has(i.id))
    .map((i) => ({ ingredientId: i.id, ingredientName: i.name, itemCode: linkByIngredientId.get(i.id)! }));

  let livestockAlerts: StoreAlertsResult["livestockAlerts"] = [];
  if (livestock.hasComparison && confirmedLinks.length > 0) {
    const livestockChanges = detectPriceChanges(livestock.current, livestock.previous);
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
    hasProduceComparison: produce.hasComparison,
    hasLivestockComparison: livestock.hasComparison,
    unlinkedIngredients,
    linkedIngredients,
  };
}
