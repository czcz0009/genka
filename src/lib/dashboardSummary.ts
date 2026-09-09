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
 *
 * パフォーマンス上の理由(優先度3)で、あえて1つの関数にまとめず3つに分けている。
 * 「平均原価率・値上げ検討数」はmenus/ingredients/menu_ingredientsだけで計算でき、
 * 常に速い。一方「今月のFL比率」「仕入れ値アラート件数」は市場価格データや固定費
 * データの追加取得が必要で相対的に遅い(特にアラート件数はDB往復が複数回発生する)。
 * 3つに分けることで、ホーム画面側でSuspenseにより遅い2つを非同期にストリーミング
 * 表示させ、速い方(登録メニュー数・平均原価率・値上げ検討数)を待たせずに
 * 表示できるようにしている。
 */
export interface FastDashboardSummary {
  menuCount: number;
  /** 売価が設定済みのメニューの原価率(%)の単純平均。1つも計算できなければnull */
  averageCostRate: number | null;
  /** 目標原価率を超えている(値上げ検討)メニュー数 */
  overTargetCount: number;
}

async function fetchRankingInputs(supabase: SupabaseClient, store: { id: string }) {
  // menu_ingredientsの取得はmenus/ingredientsの結果に依存しない(自分のフィルタだけで
  // 完結する)ため、以前は「menus+ingredients→その後menu_ingredients」と2段階に
  // 分かれていたのを1つのPromise.allにまとめ、3クエリとも並列で待つようにした
  // (優先度3のパフォーマンス改善: 待たなくていい直列待ちを無くす)。
  const [{ data: menus }, { data: ingredients }, { data: menuIngredients }] = await Promise.all([
    supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
    supabase.from("ingredients").select("id, name, current_purchase_price").eq("store_id", store.id),
    supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
      .eq("menus.store_id", store.id),
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
  const alertIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.current_purchase_price,
  }));

  return { rankingMenus, rankingMenuIngredients, rankingIngredients, alertIngredients };
}

/** 登録メニュー数・平均原価率・値上げ検討数(速い。市場価格データやFL比率は含まない) */
export async function buildFastDashboardSummary(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<FastDashboardSummary> {
  const { rankingMenus, rankingMenuIngredients, rankingIngredients } = await fetchRankingInputs(supabase, store);
  if (rankingMenus.length === 0) {
    return { menuCount: 0, averageCostRate: null, overTargetCount: 0 };
  }

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: [],
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  const costRates = summaries.map((s) => s.costRate).filter((r): r is number => r != null);
  const averageCostRate = costRates.length > 0 ? costRates.reduce((a, b) => a + b, 0) / costRates.length : null;
  const overTargetCount = summaries.filter((s) => s.overTarget).length;

  return { menuCount: rankingMenus.length, averageCostRate, overTargetCount };
}

/** 今月のFL比率(食材原価+人件費)。人件費未設定 or 今月の販売実績が無ければnull */
export async function getCurrentFlRate(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<number | null> {
  const { rankingMenus, rankingMenuIngredients, rankingIngredients } = await fetchRankingInputs(supabase, store);
  if (rankingMenus.length === 0) return null;

  const currentMonth = currentMonthString();
  const period = monthToPeriod(currentMonth);

  const [{ data: fixedCosts }, { data: sales }] = await Promise.all([
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
  return flRate;
}

/** 仕入れ値変動アラートの件数(青果物+畜産物)。市場価格データの取得を伴うため相対的に遅い */
export async function getAlertCount(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<number> {
  const { rankingMenus, rankingMenuIngredients, alertIngredients } = await fetchRankingInputs(supabase, store);
  if (rankingMenus.length === 0) return 0;

  const { produceAlerts, livestockAlerts } = await computeStoreAlerts(
    supabase,
    store,
    alertIngredients,
    rankingMenus,
    rankingMenuIngredients,
  );
  return produceAlerts.length + livestockAlerts.length;
}
