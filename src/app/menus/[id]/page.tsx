import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { calcMenuTotalCost, calcCostRate } from "@/lib/costCalc";
import { MenuIngredientsEditor } from "./MenuIngredientsEditor.tsx";

export const metadata: Metadata = {
  title: "食材を追加",
};

export default async function MenuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user || !supabase) redirect("/login");

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <p className="text-sm text-red-600 dark:text-red-400">店舗情報の取得に失敗しました。</p>
      </main>
    );
  }

  const { id: menuId } = await params;

  const [{ data: menu }, { data: menuIngredients }, { data: allIngredients }] = await Promise.all([
    supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("id", menuId).eq(
      "store_id",
      store.id,
    ).maybeSingle(),
    supabase
      .from("menu_ingredients")
      .select("id, ingredient_id, quantity, unit, ingredients(name, current_purchase_price)")
      .eq("menu_id", menuId),
    supabase.from("ingredients").select("id, name, unit, current_purchase_price").eq("store_id", store.id).order(
      "name",
    ),
  ]);

  if (!menu) notFound();

  const lines = (menuIngredients ?? []).map((mi) => {
    const ing = mi.ingredients as unknown as { name: string; current_purchase_price: number } | null;
    return {
      id: mi.id,
      ingredientId: mi.ingredient_id,
      ingredientName: ing?.name ?? "(不明な食材)",
      quantity: mi.quantity,
      unit: mi.unit,
    };
  });

  const totalCost = calcMenuTotalCost(
    lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
    new Map(
      (menuIngredients ?? []).map((mi) => [
        mi.ingredient_id,
        (mi.ingredients as unknown as { current_purchase_price: number } | null)?.current_purchase_price ?? 0,
      ]),
    ),
  );
  const costRate = calcCostRate(totalCost, menu.selling_price);
  const targetCostRate = menu.target_cost_rate ?? store.defaultTargetCostRate;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <p className="text-xs text-black/40 dark:text-white/40">ステップ 2/2</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight">{menu.name}の食材を追加</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        使う食材を1つずつ追加してください。追加するたびに原価率が更新されます。
      </p>

      <MenuIngredientsEditor
        storeId={store.id}
        menuId={menu.id}
        sellingPrice={menu.selling_price}
        totalCost={totalCost}
        costRate={costRate}
        targetCostRate={targetCostRate}
        lines={lines}
        allIngredients={(allIngredients ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: i.current_purchase_price,
        }))}
      />
    </main>
  );
}
