import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
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

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, current_purchase_price, yield_rate_percent")
    .eq("store_id", store.id)
    .order("name");

  return (
    <div className="max-w-2xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="食材"
        title="食材一覧"
        description="メニューを作らなくても、ここから食材の登録・価格の修正ができます。"
      />
      <IngredientsView
        storeId={store.id}
        initialIngredients={(ingredients ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentPurchasePrice: i.current_purchase_price,
          yieldRatePercent: i.yield_rate_percent,
        }))}
        ingredientPriceTaxMode={store.ingredientPriceTaxMode}
      />
    </div>
  );
}
