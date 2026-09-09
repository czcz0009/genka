import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { computeStoreAlerts } from "@/lib/marketPrices/computeStoreAlerts";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { AlertsView } from "./AlertsView.tsx";
import { LivestockLinkSettings } from "./LivestockLinkSettings.tsx";

export const metadata: Metadata = {
  title: "仕入れ値変動アラート",
};

export default async function AlertsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">仕入れ値変動アラート</h1>
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

  // メニューが1件もなければ、食材と紐付ける対象がそもそも無いため、市場データ
  // (旬別・月別の全履歴)を取得するだけ無駄。ここで打ち切って案内だけ出す。
  const [{ data: ingredients }, { data: menus }] = await Promise.all([
    supabase.from("ingredients").select("id, name, current_purchase_price").eq("store_id", store.id),
    supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("store_id", store.id),
  ]);

  if (!menus || menus.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">仕入れ値変動アラート</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          メニューと食材を登録すると、市場価格の変動アラートがここに表示されます。
        </p>
        <StartHerePrompt />
      </main>
    );
  }

  const { data: menuIngredients } = await supabase
    .from("menu_ingredients")
    .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
    .eq("menus.store_id", store.id);

  const alertIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.current_purchase_price,
  }));
  const alertMenus = (menus ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.selling_price,
    targetCostRate: m.target_cost_rate,
  }));
  const alertMenuIngredients = (menuIngredients ?? []).map((mi) => ({
    menuId: mi.menu_id,
    ingredientId: mi.ingredient_id,
    quantity: mi.quantity,
  }));

  const {
    produceAlerts,
    produceNeedsReview,
    livestockAlerts,
    hasProduceComparison,
    hasLivestockComparison,
    unlinkedIngredients,
    linkedIngredients,
  } = await computeStoreAlerts(supabase, store, alertIngredients, alertMenus, alertMenuIngredients);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">仕入れ値変動アラート</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        農水省「青果物卸売市場調査(旬別結果)」「畜産物卸売価格の推移」の市場価格をもとに、市場価格の変動率がそのまま仕入単価に反映されたと仮定した場合の試算原価率を表示します。実際に仕入単価を変更した結果ではありません。
      </p>

      <AlertsView
        produceAlerts={produceAlerts}
        produceNeedsReview={produceNeedsReview}
        livestockAlerts={livestockAlerts}
        hasProduceComparison={hasProduceComparison}
        hasLivestockComparison={hasLivestockComparison}
      />

      <LivestockLinkSettings unlinkedIngredients={unlinkedIngredients} linkedIngredients={linkedIngredients} />
    </main>
  );
}
