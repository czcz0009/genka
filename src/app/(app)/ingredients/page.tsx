import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { IngredientsView } from "./IngredientsView.tsx";

export const metadata: Metadata = {
  title: "食材",
};

export default async function IngredientsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-2xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="食材" title="食材一覧" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const session = await getSessionStore(supabase);
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") {
    return (
      <div className="max-w-2xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const [{ data: ingredients }, { data: prepItemComponentsRaw }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit, current_purchase_price, yield_rate_percent, is_prep_item, yield_quantity")
      .eq("store_id", store.id)
      .order("name"),
    supabase.from("prep_item_components").select("prep_item_id, component_id, quantity"),
  ]);

  const rawIngredients = ingredients ?? [];
  const nameById = new Map(rawIngredients.map((i) => [i.id, i.name]));
  const unitById = new Map(rawIngredients.map((i) => [i.id, i.unit]));
  const prepItemComponents = (prepItemComponentsRaw ?? []).map((c) => ({
    prepItemId: c.prep_item_id,
    componentId: c.component_id,
    quantity: c.quantity,
  }));

  // 仕込み品(サブレシピ)は仕入単価を持たないため、レシピから計算した実質単価に
  // 差し替えて一覧に表示する。
  const resolvedById = new Map(
    withResolvedPrepItemPrices(
      rawIngredients.map((i) => ({
        id: i.id,
        currentPurchasePrice: i.current_purchase_price,
        yieldRatePercent: i.yield_rate_percent,
        isPrepItem: i.is_prep_item,
        yieldQuantity: i.yield_quantity,
      })),
      prepItemComponents,
    ).map((i) => [i.id, i]),
  );

  // 仕込み品ID→レシピ明細(表示・編集用に材料名・単位も添える)
  const componentsByPrepItemId = new Map<
    string,
    { componentId: string; componentName: string; componentUnit: string; quantity: number }[]
  >();
  for (const c of prepItemComponents) {
    const list = componentsByPrepItemId.get(c.prepItemId) ?? [];
    list.push({
      componentId: c.componentId,
      componentName: nameById.get(c.componentId) ?? "(不明な食材)",
      componentUnit: unitById.get(c.componentId) ?? "",
      quantity: c.quantity,
    });
    componentsByPrepItemId.set(c.prepItemId, list);
  }

  return (
    <div className="max-w-2xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="食材"
          title="食材一覧"
          description="メニューを作らなくても、ここから食材の登録・価格の修正ができます。出汁やタレなど、仕込んで使い回すものは「仕込み品」として登録すると、材料の価格変更が自動で反映されます。"
        />
        <Link
          href="/ingredients/scan"
          prefetch={false}
          className="shrink-0 rounded border px-5 py-3 text-base font-semibold transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          納品書から読み取る
        </Link>
      </div>
      <IngredientsView
        storeId={store.id}
        initialIngredients={rawIngredients.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: resolvedById.get(i.id)?.currentPurchasePrice ?? i.current_purchase_price,
          yieldRatePercent: i.yield_rate_percent,
          isPrepItem: i.is_prep_item,
          yieldQuantity: i.yield_quantity,
          components: i.is_prep_item ? (componentsByPrepItemId.get(i.id) ?? []) : undefined,
        }))}
        ingredientPriceTaxMode={store.ingredientPriceTaxMode}
      />
    </div>
  );
}
