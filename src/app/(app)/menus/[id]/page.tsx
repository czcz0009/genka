import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { currentMonthString, monthToPeriod } from "@/lib/period/month.ts";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
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
  const currentPeriod = monthToPeriod(currentMonthString());

  const [{ data: menu }, { data: menuIngredients }, { data: allIngredients }, { data: prepItemComponents }, { data: currentMonthSales }] =
    await Promise.all([
      supabase.from("menus").select("id, name, selling_price, target_cost_rate").eq("id", menuId).eq(
        "store_id",
        store.id,
      ).maybeSingle(),
      supabase
        .from("menu_ingredients")
        .select(
          "id, ingredient_id, quantity, unit, ingredients(name, unit, current_purchase_price, yield_rate_percent, is_prep_item, yield_quantity)",
        )
        .eq("menu_id", menuId),
      supabase
        .from("ingredients")
        .select("id, name, unit, current_purchase_price, yield_rate_percent, is_prep_item, yield_quantity")
        .eq("store_id", store.id)
        .order("name"),
      supabase.from("prep_item_components").select("prep_item_id, component_id, quantity"),
      // 値上げシミュレーションで「月間利益」を試算するための、今月の販売数量。
      // このメニュー1件分だけの絞り込みなので、store全体を取るget_store_dataは使わない。
      supabase
        .from("menu_sales")
        .select("quantity_sold")
        .eq("menu_id", menuId)
        .eq("period_start", currentPeriod.start)
        .eq("period_end", currentPeriod.end)
        .maybeSingle(),
    ]);

  if (!menu) notFound();

  // 仕込み品(サブレシピ)は仕入単価を持たないため、レシピから計算した実質単価に
  // 差し替える(withResolvedPrepItemPrices)。差し替え後はMenuEditor.tsxにとって
  // ただの数値なので、仕込み品かどうかを画面側で意識する必要は無い。
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

  const initialLines: LocalLine[] = (menuIngredients ?? []).map((mi) => {
    const ing = mi.ingredients as unknown as
      | { name: string; unit: string; current_purchase_price: number; yield_rate_percent: number }
      | null;
    const resolved = resolvedPriceById.get(mi.ingredient_id);
    return {
      key: mi.id,
      quantity: String(mi.quantity),
      unit: mi.unit,
      ingredientName: ing?.name ?? "(不明な食材)",
      unitPrice: resolved?.currentPurchasePrice ?? ing?.current_purchase_price ?? 0,
      yieldRatePercent: resolved?.yieldRatePercent ?? ing?.yield_rate_percent ?? 100,
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
          currentPurchasePrice: resolvedPriceById.get(i.id)?.currentPurchasePrice ?? i.current_purchase_price,
          yieldRatePercent: resolvedPriceById.get(i.id)?.yieldRatePercent ?? i.yield_rate_percent,
          isPrepItem: i.is_prep_item,
        }))}
        individualTargetCostRate={menu.target_cost_rate}
        defaultTargetCostRate={store.defaultTargetCostRate}
        currentMonthQuantitySold={currentMonthSales?.quantity_sold ?? null}
        ingredientPriceTaxMode={store.ingredientPriceTaxMode}
      />
    </div>
  );
}
