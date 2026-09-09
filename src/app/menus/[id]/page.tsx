import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { MenuEditor, type LocalLine } from "../MenuEditor.tsx";

export const metadata: Metadata = {
  title: "メニューを編集",
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
      .select("id, ingredient_id, quantity, unit, ingredients(name, unit, current_purchase_price)")
      .eq("menu_id", menuId),
    supabase.from("ingredients").select("id, name, unit, current_purchase_price").eq("store_id", store.id).order(
      "name",
    ),
  ]);

  if (!menu) notFound();

  const initialLines: LocalLine[] = (menuIngredients ?? []).map((mi) => {
    const ing = mi.ingredients as unknown as { name: string; unit: string; current_purchase_price: number } | null;
    return {
      key: mi.id,
      quantity: String(mi.quantity),
      unit: mi.unit,
      ingredientName: ing?.name ?? "(不明な食材)",
      unitPrice: ing?.current_purchase_price ?? 0,
      source: { type: "existing", ingredientId: mi.ingredient_id },
    };
  });

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">{menu.name}を編集</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        メニュー名・売価・使う食材を、この1画面でまとめて編集できます。
      </p>

      <MenuEditor
        storeId={store.id}
        menuId={menu.id}
        initialName={menu.name}
        initialSellingPrice={menu.selling_price}
        initialLines={initialLines}
        allIngredients={(allIngredients ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: i.current_purchase_price,
        }))}
        targetCostRate={menu.target_cost_rate ?? store.defaultTargetCostRate}
      />
    </main>
  );
}
