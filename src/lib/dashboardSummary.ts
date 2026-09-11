import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "./menuRanking.ts";
import {
  aggregateSalesAndFoodCost,
  calcFlRatios,
  selectApplicableFixedCost,
  type FixedCostRow,
  type FixedCostType,
} from "./flRatio.ts";
import { monthToPeriod, currentMonthString } from "./period/month.ts";
import { computeStoreAlerts } from "./marketPrices/computeStoreAlerts.ts";
import { getStoreData } from "./store.ts";

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

/**
 * menus/ingredients/menu_ingredients/menu_sales/store_fixed_costsを
 * 1回のRPC(get_store_data)でまとめて取得し、ランキング計算用の形に変換する。
 *
 * cache()でラップされたgetStoreData()を経由するため、buildFastDashboardSummary・
 * getCurrentFlRate・getAlertSummaryの3つが同じリクエスト内で呼んでも、実際の
 * RPC呼び出しは1回で済む(以前は3クエリのPromise.allをこの3関数が個別に
 * 呼んでおり、さらにgetCurrentFlRateは固定費・当月販売実績を別途もう1往復
 * 取得していた)。
 */
async function fetchRankingInputs(supabase: SupabaseClient) {
  const storeData = await getStoreData(supabase);

  const rankingMenus: RankingMenu[] = (storeData?.menus ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.sellingPrice,
    targetCostRate: m.targetCostRate,
  }));
  const rankingMenuIngredients: RankingMenuIngredient[] = (storeData?.menuIngredients ?? []).map((mi) => ({
    menuId: mi.menuId,
    ingredientId: mi.ingredientId,
    quantity: mi.quantity,
  }));
  const rankingIngredients = (storeData?.ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.currentPurchasePrice,
  }));
  const alertIngredients = (storeData?.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.currentPurchasePrice,
  }));
  const sales = storeData?.sales ?? [];
  const fixedCosts = storeData?.fixedCosts ?? [];

  return { rankingMenus, rankingMenuIngredients, rankingIngredients, alertIngredients, sales, fixedCosts };
}

/** 登録メニュー数・平均原価率・値上げ検討数(速い。市場価格データやFL比率は含まない) */
export async function buildFastDashboardSummary(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<FastDashboardSummary> {
  const { rankingMenus, rankingMenuIngredients, rankingIngredients } = await fetchRankingInputs(supabase);
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

  // 売価・原価が未入力のメニューはcostRateがnullになるため、平均の対象から除外する
  // (Number.isFiniteでの二重チェックは、万一計算過程で不正な値が紛れ込んでも
  // 画面に「NaN%」を出さないための保険)。
  const costRates = summaries.map((s) => s.costRate).filter((r): r is number => r != null && Number.isFinite(r));
  const averageCostRate = costRates.length > 0 ? costRates.reduce((a, b) => a + b, 0) / costRates.length : null;
  const overTargetCount = summaries.filter((s) => s.overTarget).length;

  return { menuCount: rankingMenus.length, averageCostRate, overTargetCount };
}

/**
 * 今月のFL比率(食材原価+人件費)。人件費未設定 or 今月の販売実績が無ければnull。
 *
 * react の cache() で1リクエスト内の呼び出しをメモ化している。ダッシュボードの
 * KPIカードと「変わったこと」ダイジェストの両方から同じ値が必要になるが、
 * 同じ内容を2回計算・再取得すると優先度3で直した無駄なクエリが復活してしまう。
 */
export const getCurrentFlRate = cache(async function getCurrentFlRate(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<number | null> {
  const { rankingMenus, rankingMenuIngredients, rankingIngredients, sales, fixedCosts } =
    await fetchRankingInputs(supabase);
  if (rankingMenus.length === 0) return null;

  const currentMonth = currentMonthString();
  const period = monthToPeriod(currentMonth);

  // fetchRankingInputsが既に(cache()経由で)取得済みのsales/fixedCostsを
  // その場でフィルタするだけで済むため、ここでの追加のDB往復は発生しない。
  const rankingSales: RankingSales[] = sales
    .filter((s) => s.periodStart === period.start && s.periodEnd === period.end)
    .map((s) => ({ menuId: s.menuId, quantitySold: s.quantitySold }));
  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: rankingSales,
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  const fixedCostRows: FixedCostRow[] = fixedCosts.map((f) => ({
    // store_fixed_costs.cost_typeはDBのcheck制約で'rent'|'labor'のみ許可されている
    // (0005_ranking_and_fl_ratio.sql)。RPCのJSON経由では型情報が失われるため、
    // ここで明示的に絞り込む。
    costType: f.costType as FixedCostType,
    amount: f.amount,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
  }));
  const { totalSales, totalFoodCost } = aggregateSalesAndFoodCost(summaries);
  const laborCost = selectApplicableFixedCost(fixedCostRows, "labor", period);
  const rentCost = selectApplicableFixedCost(fixedCostRows, "rent", period);
  const { flRate } = calcFlRatios({ totalSales, totalFoodCost, laborCost, rentCost });
  return flRate;
});

export interface AlertDigestItem {
  ingredientName: string;
  changePercent: number;
  direction: "up" | "down";
  affectedMenuNames: string[];
}

export interface AlertSummary {
  count: number;
  /** ダッシュボードの「変わったこと」ダイジェスト用。変動幅が大きい順の上位数件。 */
  topAlerts: AlertDigestItem[];
}

/**
 * 仕入れ値変動アラートの件数・上位内容(青果物+畜産物)。市場価格データの取得を
 * 伴うため相対的に遅い。cache()でメモ化し、KPIカードとダイジェストの両方から
 * 呼んでも実際の計算は1リクエストにつき1回で済むようにしている。
 */
export const getAlertSummary = cache(async function getAlertSummary(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
): Promise<AlertSummary> {
  const { rankingMenus, rankingMenuIngredients, alertIngredients } = await fetchRankingInputs(supabase);
  if (rankingMenus.length === 0) return { count: 0, topAlerts: [] };

  const { produceAlerts, livestockAlerts } = await computeStoreAlerts(
    supabase,
    store,
    alertIngredients,
    rankingMenus,
    rankingMenuIngredients,
  );
  const allAlerts = [...produceAlerts, ...livestockAlerts].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );
  const topAlerts: AlertDigestItem[] = allAlerts.slice(0, 2).map((a) => ({
    ingredientName: a.ingredientName,
    changePercent: a.changePercent,
    direction: a.direction,
    affectedMenuNames: a.affectedMenus.map((m) => m.menuName),
  }));

  return { count: allAlerts.length, topAlerts };
});
