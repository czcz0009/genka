import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "@/lib/menuRanking";
import { monthToPeriod, currentMonthString } from "@/lib/period/month";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { RankingView } from "./RankingView.tsx";

export const metadata: Metadata = {
  title: "メニュー別収益貢献度ランキング",
};

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="収益ランキング" title="メニュー別収益貢献度ランキング" />
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

  // menus・ingredients・menu_ingredients・menu_sales(全期間)を1回のRPC
  // (get_store_data)でまとめて取得する(以前は最大5回のクエリに分かれていた)。
  // 「対象月の絞り込み」「利用可能な月の一覧」はどちらもこの1回の取得結果から
  // JS側で計算するため、月ごとの追加クエリは発生しない。
  const storeData = await getStoreData(supabase);
  const menus = storeData?.menus ?? [];

  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="収益ランキング" title="メニュー別収益貢献度ランキング" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューを登録すると、利益貢献度のランキングがここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  const allSales = storeData?.sales ?? [];
  const availableMonths = Array.from(new Set(allSales.map((s) => s.periodStart.slice(0, 7)))).sort();

  const month = monthParam ?? availableMonths[availableMonths.length - 1] ?? currentMonthString();
  const period = monthToPeriod(month);

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
  const rankingSales: RankingSales[] = allSales
    .filter((s) => s.periodStart === period.start && s.periodEnd === period.end)
    .map((s) => ({ menuId: s.menuId, quantitySold: s.quantitySold }));
  const rankingIngredients = (storeData?.ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.currentPurchasePrice,
  }));

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: rankingSales,
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="収益ランキング"
        title="メニュー別収益貢献度ランキング"
        description="「販売数量 ×(売価-原価)」で実際の利益貢献度を算出しています。原価率が高くても数が出ないメニューより、利益への貢献が大きいメニューが上位に来ます。"
      />
      <RankingView
        storeId={store.id}
        month={month}
        availableMonths={availableMonths}
        summaries={summaries}
        menus={rankingMenus}
      />
    </div>
  );
}
