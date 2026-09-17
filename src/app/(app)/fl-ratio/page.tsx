import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData, getIngredientPriceHistory } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "@/lib/menuRanking";
import { resolveHistoricalPrice } from "@/lib/ingredientPriceHistory";
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
import { HelpButton } from "@/components/HelpButton.tsx";
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
  // 仕入単価の変更履歴(過去の月を当時の単価で再現するため)はこの画面でしか
  // 使わないため、get_store_dataとは別のRPCで並行して取得する。
  const [storeData, priceHistory] = await Promise.all([
    getStoreData(supabase, rangeStart, rangeEnd),
    getIngredientPriceHistory(supabase),
  ]);
  const menus = storeData?.menus ?? [];

  // メニューが1件もなければ、上で取得した月次推移用データは使わずに
  // 「まずはここから」の案内だけ出す。
  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="FL比率" title="FL比率・FLR比率" actions={<FlRatioHelpButton />} />
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
    // store_fixed_costs.cost_typeはDBのcheck制約で'rent'|'labor'|'loss'のみ許可されている
    // (0005_ranking_and_fl_ratio.sql、'loss'は0014_loss_discount_fixed_cost.sqlで追加)。
    // RPCのJSON経由では型情報が失われるため、ここで明示的に絞り込む。
    costType: f.costType as FixedCostType,
    amount: f.amount,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
  }));
  const trend = months.map((m) => {
    const period = monthToPeriod(m);
    const monthSales: RankingSales[] = (storeData?.sales ?? [])
      .filter((s) => s.periodStart === period.start && s.periodEnd === period.end)
      .map((s) => ({ menuId: s.menuId, quantitySold: s.quantitySold }));

    // その月の末日時点で実際に使われていた仕入単価を再現する(値上がり後にこの画面を
    // 見ても、過去の月の食材原価が今の単価で遡及的に再計算されないようにするため)。
    // 月ごとに単価が変わるため、trend内の月ごとに解決し直す必要がある。
    const rankingIngredients = (storeData?.ingredients ?? []).map((i) => ({
      id: i.id,
      currentPurchasePrice: resolveHistoricalPrice(priceHistory, i.id, period.end, i.currentPurchasePrice),
      yieldRatePercent: i.yieldRatePercent,
    }));

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
    const lossAmount = selectApplicableFixedCost(fixedCostRows, "loss", period);
    const ratios = calcFlRatios({ totalSales, totalFoodCost, laborCost, rentCost, lossAmount });

    return { month: m, label: formatMonthLabel(m), totalSales, laborCost, rentCost, lossAmount, ...ratios };
  });

  const current = trend[trend.length - 1];
  const currentPeriod = monthToPeriod(month);
  const currentLabor = selectApplicableFixedCost(fixedCostRows, "labor", currentPeriod);
  const currentRent = selectApplicableFixedCost(fixedCostRows, "rent", currentPeriod);
  const currentLoss = selectApplicableFixedCost(fixedCostRows, "loss", currentPeriod);
  // 売上データ(CSV取り込み・手動登録のどちらも含む)が1件も無い店舗では、
  // 実質原価率は「大づかみに見せる」という目的自体が成立しないため、入力欄ごと隠す。
  const hasSalesData = (storeData?.sales?.length ?? 0) > 0;

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="FL比率"
        title="FL比率・FLR比率"
        actions={<FlRatioHelpButton />}
        description={
          <>
            業界目安はFL比率{FL_BENCHMARK_PERCENT}%未満・FLR比率{FLR_BENCHMARK_PERCENT}
            %未満と言われますが、業態によって適正範囲は大きく異なります。あくまで一般的な目安として、自店の推移の把握に使ってください。
            <br />
            <span className="text-xs opacity-80">
              過去月の食材原価は、その月の時点で記録されていた仕入単価をもとに計算しています。ただし、メニューの食材構成(レシピ)自体は現在の内容で計算するため、当時からレシピを変更している場合はその影響までは反映されません。
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
        currentLoss={currentLoss}
        hasSalesData={hasSalesData}
      />
    </div>
  );
}

/**
 * 「そもそもFL比率・FLR比率とは何のための指標か」を説明するヘルプ。
 * ページ上部に常時表示されている説明文(業界目安の数値・計算の注意点)とは
 * 粒度を分け、こちらは原価率との違い・何のために見るのかに絞る。
 */
function FlRatioHelpButton() {
  return (
    <HelpButton title="FL比率・FLR比率とは">
      <p>
        原価率が「メニュー1品ごと」の値付けの目安なのに対し、FL比率・FLR比率は「お店全体」の経営が健全かどうかを見る指標です。
      </p>
      <p className="mt-3">
        食材原価に人件費を加えたものがFL比率、そこにさらに家賃を加えたものがFLR比率です。業界の目安(FL比率60%未満・FLR比率70%未満)はあくまで一般的な水準で、業態によって適正範囲は大きく異なるため、自店の月ごとの推移を追うための参考値として使ってください。
      </p>
    </HelpButton>
  );
}
