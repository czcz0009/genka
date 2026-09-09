import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient } from "@/lib/menuRanking";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";

export const metadata: Metadata = {
  title: "メニュー一覧",
};

function formatYen(n: number | null): string {
  if (n == null) return "-";
  return `¥${Math.round(n).toLocaleString()}`;
}

export default async function MenusPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">メニュー一覧</h1>
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-sm text-red-600 dark:text-red-400">店舗情報の取得に失敗しました。</p>
      </main>
    );
  }

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name, selling_price, target_cost_rate, created_at")
    .eq("store_id", store.id)
    .order("created_at", { ascending: true });

  if (!menus || menus.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">メニュー一覧</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          登録したメニューの原価・原価率がここに一覧で表示されます。
        </p>
        <StartHerePrompt />
      </main>
    );
  }

  // メニュー一覧に必要なのは「原価・原価率」だけで、販売実績は使わないため
  // sales は渡さない(渡さなければ利益貢献度は常に0/null扱いになり、ソート順に
  // 影響しない=登録順のまま表示される)。
  const [{ data: menuIngredients }, { data: ingredients }] = await Promise.all([
    supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
      .eq("menus.store_id", store.id),
    supabase.from("ingredients").select("id, current_purchase_price").eq("store_id", store.id),
  ]);

  const rankingMenus: RankingMenu[] = menus.map((m) => ({
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

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: [],
    defaultTargetCostRate: store.defaultTargetCostRate,
  });
  // buildMenuRanking は利益貢献度順に並び替えるため、登録順に戻す
  const orderById = new Map(menus.map((m, idx) => [m.id, idx]));
  const rows = [...summaries].sort((a, b) => (orderById.get(a.menuId) ?? 0) - (orderById.get(b.menuId) ?? 0));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">メニュー一覧</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            登録済みのメニューと、それぞれの原価・原価率です。タップすると食材の追加・編集ができます。
          </p>
        </div>
        <Link
          href="/menus/new"
          className="shrink-0 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          + メニューを追加する
        </Link>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((s) => (
          <li key={s.menuId}>
            <Link
              href={`/menus/${s.menuId}`}
              className="flex flex-col gap-2 rounded-lg border border-black/15 p-5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-base font-medium">{s.menuName}</span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-black/60 dark:text-white/60">
                <span>売価 {formatYen(s.sellingPrice)}</span>
                <span>原価 {formatYen(s.totalCost)}</span>
                <span
                  className={
                    s.overTarget
                      ? "font-medium text-red-600 dark:text-red-400"
                      : s.costRate != null
                        ? "text-black/70 dark:text-white/70"
                        : "text-black/30 dark:text-white/30"
                  }
                >
                  原価率 {s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}(目標{s.targetCostRate}%)
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
