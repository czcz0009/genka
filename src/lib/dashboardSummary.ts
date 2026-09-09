import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "./menuRanking.ts";
import { aggregateSalesAndFoodCost, calcFlRatios, selectApplicableFixedCost, type FixedCostRow } from "./flRatio.ts";
import { monthToPeriod, currentMonthString } from "./period/month.ts";
import { computeStoreAlerts } from "./marketPrices/computeStoreAlerts.ts";

/**
 * ホーム画面(ダッシュボード)の経営状況サマリー。
 *
 * 「登録メニュー数」だけでは経営状況が一目で分からない、という指摘を受けて追加。
 * ランキング画面・FL比率画面・仕入れ値アラート画面それぞれが持つ計算ロジックを
 * 使い回し、ホーム用に「今月時点の1つの数値」だけを抜き出す。
 */
export interface DashboardSummary {
  menuCount: number;
  /** 売価が設定済みのメニューの原価率(%)の単純平均。1つも計算できなければnull */
  averageCostRate: number | null;
  /** 目標原価率を超えている(値上げ検討)メニュー数 */
  overTargetCount: number;
  /** 仕入れ値変動アラートの件数(青果物+畜産物) */
  alertCount: number;
  /** 今月のFL比率(食材原価+人件費)。人件費未設定 or 今月の販売実績が無ければnull */
  flRate: number | null;
}

export async function buildDashboardSummary(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<DashboardSummary> {
  const [{ data: menus }, { data: ingredients }] = await Promise.all([
    supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
    supabase.from("ingredients").select("id, name, current_purchase_price").eq("store_id", store.id),
  ]);

  const menuCount = menus?.length ?? 0;
  if (menuCount === 0) {
    return { menuCount: 0, averageCostRate: null, overTargetCount: 0, alertCount: 0, flRate: null };
  }

  const currentMonth = currentMonthString();
  const period = monthToPeriod(currentMonth);

  const [{ data: menuIngredients }, { data: fixedCosts }, { data: sales }] = await Promise.all([
    supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
      .eq("menus.store_id", store.id),
    supabase.from("store_fixed_costs").select("cost_type, amount, period_start, period_end").eq(
      "store_id",
      store.id,
    ),
    supabase
      .from("menu_sales")
      .select("menu_id, quantity_sold, menus!inner(store_id)")
      .eq("menus.store_id", store.id)
      .eq("period_start", period.start)
      .eq("period_end", period.end),
  ]);

  const rankingMenus: RankingMenu[] = (menus ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.selling_price,
    targetCostRate: m.target_cost_rate,
  }));
  const rankingMenuIngredients: RankingMenuIngredient[] = (menuIngredients ?? []).map((mi) => ({
    menuId: mi.menu_id,
    ingredientId: mi.ingredient_id,
    quantity: mi.quantity,
  }));
  const rankingIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.current_purchase_price,
  }));
  const rankingSales: RankingSales[] = (sales ?? []).map((s) => ({
    menuId: s.menu_id,
    quantitySold: s.quantity_sold,
  }));

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: rankingSales,
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  const costRates = summaries.map((s) => s.costRate).filter((r): r is number => r != null);
  const averageCostRate = costRates.length > 0 ? costRates.reduce((a, b) => a + b, 0) / costRates.length : null;
  const overTargetCount = summaries.filter((s) => s.overTarget).length;

  const fixedCostRows: FixedCostRow[] = (fixedCosts ?? []).map((f) => ({
    costType: f.cost_type,
    amount: f.amount,
    periodStart: f.period_start,
    periodEnd: f.period_end,
  }));
  const { totalSales, totalFoodCost } = aggregateSalesAndFoodCost(summaries);
  const laborCost = selectApplicableFixedCost(fixedCostRows, "labor", period);
  const rentCost = selectApplicableFixedCost(fixedCostRows, "rent", period);
  const { flRate } = calcFlRatios({ totalSales, totalFoodCost, laborCost, rentCost });

  const alertIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.current_purchase_price,
  }));
  const alertMenus = rankingMenus;
  const alertMenuIngredients = rankingMenuIngredients;
  const { produceAlerts, livestockAlerts } = await computeStoreAlerts(
    supabase,
    store,
    alertIngredients,
    alertMenus,
    alertMenuIngredients,
  );
  const alertCount = produceAlerts.length + livestockAlerts.length;

  return { menuCount, averageCostRate, overTargetCount, alertCount, flRate };
}
