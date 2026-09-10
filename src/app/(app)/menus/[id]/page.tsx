import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { MenuEditor, type LocalLine } from "../MenuEditor.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "メニューを編集",
};

export default async function MenuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const session = await getSessionStore(supabase);
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") {
    return (
      <div className="max-w-2xl p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

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
    <div className="max-w-2xl p-6 md:p-8">
      <PageHeader
        eyebrow="メニュー管理"
        title={`${menu.name}を編集`}
        description="メニュー名・売価・使う食材を、この1画面でまとめて編集できます。"
      />

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
    </div>
  );
}
