import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
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
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="収益ランキング" title="メニュー別収益貢献度ランキング" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user || !supabase) redirect("/login");

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }

  const { month: monthParam } = await searchParams;

  // menus・menuSalesPeriods・menu_ingredients・ingredientsはどれもstore_idだけで
  // 絞り込めて互いの結果に依存しないため、最初から並列で投げる(以前は
  // 「まずmenusだけ→空でなければmenuSalesPeriods→その後残りをPromise.all」と
  // 2段階に直列で待っており、ナビゲーションのたびに無駄な往復が発生していた)。
  // sales(対象月の販売実績)だけはmonthの決定(menuSalesPeriodsの結果が必要)に
  // 依存するため、これだけは後段で別途取得する。
  const [{ data: menus }, { data: menuSalesPeriods }, { data: menuIngredients }, { data: ingredients }] =
    await Promise.all([
      supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
      supabase
        .from("menu_sales")
        .select("period_start, menus!inner(store_id)")
        .eq("menus.store_id", store.id)
        .order("period_start", { ascending: false }),
      supabase.from("menu_ingredients").select("menu_id, ingredient_id, quantity, menus!inner(store_id)").eq(
        "menus.store_id",
        store.id,
      ),
      supabase.from("ingredients").select("id, current_purchase_price").eq("store_id", store.id),
    ]);

  if (!menus || menus.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="収益ランキング" title="メニュー別収益貢献度ランキング" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューを登録すると、利益貢献度のランキングがここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  const availableMonths = Array.from(
    new Set((menuSalesPeriods ?? []).map((r) => (r.period_start as string).slice(0, 7))),
  ).sort();

  const month = monthParam ?? availableMonths[availableMonths.length - 1] ?? currentMonthString();
  const period = monthToPeriod(month);

  const { data: sales } = await supabase
    .from("menu_sales")
    .select("menu_id, quantity_sold, menus!inner(store_id)")
    .eq("menus.store_id", store.id)
    .eq("period_start", period.start)
    .eq("period_end", period.end);

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
  const rankingSales: RankingSales[] = (sales ?? []).map((s) => ({
    menuId: s.menu_id,
    quantitySold: s.quantity_sold,
  }));
  const rankingIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.current_purchase_price,
  }));

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: rankingSales,
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
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
