import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "@/lib/menuRanking";
import { monthToPeriod, currentMonthString } from "@/lib/period/month";
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">メニュー別収益貢献度ランキング</h1>
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

  const { data: menuSalesPeriods } = await supabase
    .from("menu_sales")
    .select("period_start, menus!inner(store_id)")
    .eq("menus.store_id", store.id)
    .order("period_start", { ascending: false });

  const availableMonths = Array.from(
    new Set((menuSalesPeriods ?? []).map((r) => (r.period_start as string).slice(0, 7))),
  ).sort();

  const month = monthParam ?? availableMonths[availableMonths.length - 1] ?? currentMonthString();
  const period = monthToPeriod(month);

  const [{ data: menus }, { data: menuIngredients }, { data: ingredients }, { data: sales }] = await Promise.all([
    supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
    supabase.from("menu_ingredients").select("menu_id, ingredient_id, quantity, menus!inner(store_id)").eq(
      "menus.store_id",
      store.id,
    ),
    supabase.from("ingredients").select("id, current_purchase_price").eq("store_id", store.id),
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">メニュー別収益貢献度ランキング</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        「販売数量 ×(売価-原価)」で実際の利益貢献度を算出しています。原価率が高くても数が出ないメニューより、利益への貢献が大きいメニューが上位に来ます。
      </p>
      <RankingView
        storeId={store.id}
        month={month}
        availableMonths={availableMonths}
        summaries={summaries}
        menus={rankingMenus}
      />
    </main>
  );
}
