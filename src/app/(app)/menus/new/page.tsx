import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
import { MenuEditor } from "../MenuEditor.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "メニューを登録",
};

export default async function NewMenuPage() {
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

  const [{ data: allIngredients }, { data: prepItemComponents }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit, current_purchase_price, yield_rate_percent, is_prep_item, yield_quantity")
      .eq("store_id", store.id)
      .order("name"),
    supabase.from("prep_item_components").select("prep_item_id, component_id, quantity"),
  ]);

  // 仕込み品(サブレシピ)は仕入単価を持たないため、レシピから計算した実質単価に
  // 差し替える。メニュー編集画面(MenuEditor.tsx)は差し替え後の値をただの
  // 食材の単価として扱うだけでよく、仕込み品かどうかを意識する必要が無い。
  const resolvedIngredients = withResolvedPrepItemPrices(
    (allIngredients ?? []).map((i) => ({
      id: i.id,
      currentPurchasePrice: i.current_purchase_price,
      yieldRatePercent: i.yield_rate_percent,
      isPrepItem: i.is_prep_item,
      yieldQuantity: i.yield_quantity,
    })),
    (prepItemComponents ?? []).map((c) => ({
      prepItemId: c.prep_item_id,
      componentId: c.component_id,
      quantity: c.quantity,
    })),
  );
  const resolvedPriceById = new Map(resolvedIngredients.map((i) => [i.id, i]));

  return (
    <div className="max-w-2xl p-6 md:p-8">
      <PageHeader
        eyebrow="メニュー管理"
        title="メニューを登録"
        description="メニュー名・売価・使う食材を、この1画面でまとめて登録できます。食材は後から追加・削除もできます。"
      />

      <MenuEditor
        storeId={store.id}
        initialName=""
        initialSellingPrice={null}
        initialLines={[]}
        allIngredients={(allIngredients ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: resolvedPriceById.get(i.id)?.currentPurchasePrice ?? i.current_purchase_price,
          yieldRatePercent: resolvedPriceById.get(i.id)?.yieldRatePercent ?? i.yield_rate_percent,
          isPrepItem: i.is_prep_item,
        }))}
        individualTargetCostRate={null}
        defaultTargetCostRate={store.defaultTargetCostRate}
        currentMonthQuantitySold={null}
        ingredientPriceTaxMode={store.ingredientPriceTaxMode}
      />
    </div>
  );
}
