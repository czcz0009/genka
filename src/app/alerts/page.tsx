import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { detectPriceChanges } from "@/lib/marketPrices/detectPriceChanges";
import { matchIngredientsToItems } from "@/lib/marketPrices/matchIngredientToItem";
import { generateMarketPriceAlerts } from "@/lib/marketPrices/generateAlerts";
import { confirmedLinksToMatches } from "@/lib/marketPrices/livestock/confirmedLinksToMatches";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "@/lib/marketPrices/livestock/chikusanColumns";
import { suggestChikusanItems } from "@/lib/marketPrices/livestock/suggestChikusanItem";
import type { SyuyoItem } from "@/lib/marketPrices/parseSyuyoCsv";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { AlertsView } from "./AlertsView.tsx";
import { LivestockLinkSettings } from "./LivestockLinkSettings.tsx";

export const metadata: Metadata = {
  title: "仕入れ値変動アラート",
};

/** period_year/month(/third) の組み合わせをキー化する */
function periodKey(row: { period_year: number; period_month: number; period_third?: number | null }): number {
  return row.period_year * 10000 + row.period_month * 100 + (row.period_third ?? 0);
}

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

  const [{ data: menuIngredients }, { data: produceObservations }, { data: livestockObservations }, { data: links }] =
    await Promise.all([
      supabase
        .from("menu_ingredients")
        .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
        .eq("menus.store_id", store.id),
      supabase
        .from("market_price_observations")
        .select("item_code, item_name, period_year, period_month, period_third, price_per_kg")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .order("period_third", { ascending: false })
        .limit(1200),
      supabase
        .from("livestock_price_observations")
        .select("item_code, item_name, period_year, period_month, price_per_kg")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(200),
      supabase.from("ingredient_market_links").select("ingredient_id, item_code").eq("source", "chikusan"),
    ]);

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

  // --- 青果物: 直近2期分の観測データから前期比較する ---
  const produceKeys = Array.from(new Set((produceObservations ?? []).map(periodKey))).sort((a, b) => b - a);
  const produceCurrentKey = produceKeys[0];
  const producePreviousKey = produceKeys[1];
  const produceCurrentItems: SyuyoItem[] = (produceObservations ?? [])
    .filter((r) => periodKey(r) === produceCurrentKey)
    .map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      isBreakdownRow: false,
      wholesaleQuantityTon: null,
      wholesaleValueThousandYen: null,
      pricePerKg: r.price_per_kg,
      yoyQuantityPercent: null,
      yoyPricePercent: null,
      prevThirdQuantityPercent: null,
      prevThirdPricePercent: null,
    }));
  const producePreviousItems: SyuyoItem[] = (produceObservations ?? [])
    .filter((r) => periodKey(r) === producePreviousKey)
    .map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      isBreakdownRow: false,
      wholesaleQuantityTon: null,
      wholesaleValueThousandYen: null,
      pricePerKg: r.price_per_kg,
      yoyQuantityPercent: null,
      yoyPricePercent: null,
      prevThirdQuantityPercent: null,
      prevThirdPricePercent: null,
    }));

  let produceAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"] = [];
  let produceNeedsReview: ReturnType<typeof generateMarketPriceAlerts>["needsReviewMatches"] = [];
  if (producePreviousKey != null) {
    const produceChanges = detectPriceChanges(produceCurrentItems, producePreviousItems);
    const produceMatches = matchIngredientsToItems(
      alertIngredients.map((i) => ({ id: i.id, name: i.name })),
      produceCurrentItems,
    );
    const result = generateMarketPriceAlerts({
      priceChanges: produceChanges,
      matches: produceMatches,
      ingredients: alertIngredients,
      menus: alertMenus,
      menuIngredients: alertMenuIngredients,
      defaultTargetCostRate: store.defaultTargetCostRate,
    });
    produceAlerts = result.alerts;
    produceNeedsReview = result.needsReviewMatches;
  }

  // --- 畜産物: 直近2ヶ月分の観測データから前月比較する。マッチングは確定リンクのみ ---
  const livestockKeys = Array.from(new Set((livestockObservations ?? []).map(periodKey))).sort((a, b) => b - a);
  const livestockCurrentKey = livestockKeys[0];
  const livestockPreviousKey = livestockKeys[1];
  const toLivestockItem = (r: { item_code: string; item_name: string; price_per_kg: number | null }): SyuyoItem => ({
    itemCode: r.item_code,
    itemName: r.item_name,
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg: r.price_per_kg,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
  });
  const livestockCurrentItems = (livestockObservations ?? [])
    .filter((r) => periodKey(r) === livestockCurrentKey)
    .map(toLivestockItem);
  const livestockPreviousItems = (livestockObservations ?? [])
    .filter((r) => periodKey(r) === livestockPreviousKey)
    .map(toLivestockItem);

  const linkByIngredientId = new Map((links ?? []).map((l) => [l.ingredient_id, l.item_code as ChikusanItemCode]));
  const confirmedLinks = alertIngredients
    .filter((i) => linkByIngredientId.has(i.id))
    .map((i) => ({ ingredientId: i.id, ingredientName: i.name, itemCode: linkByIngredientId.get(i.id)! }));

  let livestockAlerts: ReturnType<typeof generateMarketPriceAlerts>["alerts"] = [];
  if (livestockPreviousKey != null && confirmedLinks.length > 0) {
    const livestockChanges = detectPriceChanges(livestockCurrentItems, livestockPreviousItems);
    const livestockMatches = confirmedLinksToMatches(confirmedLinks);
    const result = generateMarketPriceAlerts({
      priceChanges: livestockChanges,
      matches: livestockMatches,
      ingredients: alertIngredients,
      menus: alertMenus,
      menuIngredients: alertMenuIngredients,
      defaultTargetCostRate: store.defaultTargetCostRate,
    });
    livestockAlerts = result.alerts;
  }

  const unlinkedIngredients = alertIngredients
    .filter((i) => !linkByIngredientId.has(i.id))
    .map((i) => ({ id: i.id, name: i.name, suggestions: suggestChikusanItems(i.name).slice(0, 3) }));
  const linkedIngredients = alertIngredients
    .filter((i) => linkByIngredientId.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      itemCode: linkByIngredientId.get(i.id)!,
      itemLabel: CHIKUSAN_COLUMNS.find((c) => c.itemCode === linkByIngredientId.get(i.id))?.label ?? "",
    }));

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
        hasProduceComparison={producePreviousKey != null}
        hasLivestockComparison={livestockPreviousKey != null}
      />

      <LivestockLinkSettings unlinkedIngredients={unlinkedIngredients} linkedIngredients={linkedIngredients} />
    </main>
  );
}
