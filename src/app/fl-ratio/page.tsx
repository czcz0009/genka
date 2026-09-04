import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "@/lib/menuRanking";
import {
  aggregateSalesAndFoodCost,
  calcFlRatios,
  selectApplicableFixedCost,
  FL_BENCHMARK_PERCENT,
  FLR_BENCHMARK_PERCENT,
  type FixedCostRow,
} from "@/lib/flRatio";
import { monthToPeriod, currentMonthString, recentMonths, formatMonthLabel } from "@/lib/period/month";
import { FlRatioView } from "./FlRatioView.tsx";

export const metadata: Metadata = {
  title: "FL比率・FLR比率",
};

const TREND_MONTHS = 6;

export default async function FlRatioPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">FL比率・FLR比率</h1>
        <p className="mt-4 text-sm text-black/60 dark:text-white/60">
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user || !supabase) redirect("/login");

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="text-sm text-red-600 dark:text-red-400">店舗情報の取得に失敗しました。</p>
      </main>
    );
  }

  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonthString();
  const months = recentMonths(month, TREND_MONTHS);
  const rangeStart = monthToPeriod(months[0]).start;
  const rangeEnd = monthToPeriod(months[months.length - 1]).end;

  const [{ data: menus }, { data: menuIngredients }, { data: ingredients }, { data: sales }, { data: fixedCosts }] =
    await Promise.all([
      supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
      supabase
        .from("menu_ingredients")
        .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
        .eq("menus.store_id", store.id),
      supabase.from("ingredients").select("id, current_purchase_price").eq("store_id", store.id),
      supabase
        .from("menu_sales")
        .select("menu_id, quantity_sold, period_start, period_end, menus!inner(store_id)")
        .eq("menus.store_id", store.id)
        .gte("period_start", rangeStart)
        .lte("period_end", rangeEnd),
      supabase
        .from("store_fixed_costs")
        .select("cost_type, amount, period_start, period_end")
        .eq("store_id", store.id),
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
  const fixedCostRows: FixedCostRow[] = (fixedCosts ?? []).map((f) => ({
    costType: f.cost_type,
    amount: f.amount,
    periodStart: f.period_start,
    periodEnd: f.period_end,
  }));
  const rankingIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.current_purchase_price,
  }));

  const trend = months.map((m) => {
    const period = monthToPeriod(m);
    const monthSales: RankingSales[] = (sales ?? [])
      .filter((s) => s.period_start === period.start && s.period_end === period.end)
      .map((s) => ({ menuId: s.menu_id, quantitySold: s.quantity_sold }));

    const summaries = buildMenuRanking({
      menus: rankingMenus,
      menuIngredients: rankingMenuIngredients,
      ingredients: rankingIngredients,
      sales: monthSales,
      defaultTargetCostRate: store.defaultTargetCostRate,
    });
    const { totalSales, totalFoodCost } = aggregateSalesAndFoodCost(summaries);
    const laborCost = selectApplicableFixedCost(fixedCostRows, "labor", period);
    const rentCost = selectApplicableFixedCost(fixedCostRows, "rent", period);
    const ratios = calcFlRatios({ totalSales, totalFoodCost, laborCost, rentCost });

    return { month: m, label: formatMonthLabel(m), totalSales, laborCost, rentCost, ...ratios };
  });

  const current = trend[trend.length - 1];
  const currentPeriod = monthToPeriod(month);
  const currentLabor = selectApplicableFixedCost(fixedCostRows, "labor", currentPeriod);
  const currentRent = selectApplicableFixedCost(fixedCostRows, "rent", currentPeriod);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">FL比率・FLR比率</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        業界目安はFL比率{FL_BENCHMARK_PERCENT}%未満・FLR比率{FLR_BENCHMARK_PERCENT}
        %未満と言われますが、業態によって適正範囲は大きく異なります。あくまで一般的な目安として、自店の推移の把握に使ってください。
      </p>
      <p className="mt-1 text-xs text-black/40 dark:text-white/40">
        過去月の食材原価は、現在登録されている仕入単価を使って再計算した参考値です(当時の実際の仕入単価とは異なる場合があります)。
      </p>
      <FlRatioView
        storeId={store.id}
        month={month}
        current={current}
        trend={trend}
        currentLabor={currentLabor}
        currentRent={currentRent}
      />
    </main>
  );
}
