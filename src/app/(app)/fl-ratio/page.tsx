import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "@/lib/menuRanking";
import {
  aggregateSalesAndFoodCost,
  calcFlRatios,
  selectApplicableFixedCost,
  FL_BENCHMARK_PERCENT,
  FLR_BENCHMARK_PERCENT,
  type FixedCostRow,
  type FixedCostType,
} from "@/lib/flRatio";
import { monthToPeriod, currentMonthString, recentMonths, formatMonthLabel } from "@/lib/period/month";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
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
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="FL比率" title="FL比率・FLR比率" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const session = await getSessionStore(supabase);
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonthString();
  const months = recentMonths(month, TREND_MONTHS);
  const rangeStart = monthToPeriod(months[0]).start;
  const rangeEnd = monthToPeriod(months[months.length - 1]).end;

  // menus・menu_ingredients・ingredients・sales(直近6ヶ月分)・fixedCostsを
  // 1回のRPC(get_store_data)でまとめて取得する(以前は最大5クエリの並列取得
  // だったが、往復そのものを1回に減らす)。
  const storeData = await getStoreData(supabase, rangeStart, rangeEnd);
  const menus = storeData?.menus ?? [];

  // メニューが1件もなければ、上で取得した月次推移用データは使わずに
  // 「まずはここから」の案内だけ出す。
  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="FL比率" title="FL比率・FLR比率" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューを登録すると、F比率(食材原価)を含むFL比率がここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  const rankingMenus: RankingMenu[] = menus.map((m) => ({
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
  const fixedCostRows: FixedCostRow[] = (storeData?.fixedCosts ?? []).map((f) => ({
    // store_fixed_costs.cost_typeはDBのcheck制約で'rent'|'labor'のみ許可されている
    // (0005_ranking_and_fl_ratio.sql)。RPCのJSON経由では型情報が失われるため、
    // ここで明示的に絞り込む。
    costType: f.costType as FixedCostType,
    amount: f.amount,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
  }));
  const rankingIngredients = (storeData?.ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.currentPurchasePrice,
  }));

  const trend = months.map((m) => {
    const period = monthToPeriod(m);
    const monthSales: RankingSales[] = (storeData?.sales ?? [])
      .filter((s) => s.periodStart === period.start && s.periodEnd === period.end)
      .map((s) => ({ menuId: s.menuId, quantitySold: s.quantitySold }));

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
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="FL比率"
        title="FL比率・FLR比率"
        description={
          <>
            業界目安はFL比率{FL_BENCHMARK_PERCENT}%未満・FLR比率{FLR_BENCHMARK_PERCENT}
            %未満と言われますが、業態によって適正範囲は大きく異なります。あくまで一般的な目安として、自店の推移の把握に使ってください。
            <br />
            <span className="text-xs opacity-80">
              過去月の食材原価は、現在登録されている仕入単価を使って再計算した参考値です(当時の実際の仕入単価とは異なる場合があります)。
            </span>
          </>
        }
      />
      <FlRatioView
        storeId={store.id}
        month={month}
        current={current}
        trend={trend}
        currentLabor={currentLabor}
        currentRent={currentRent}
      />
    </div>
  );
}
