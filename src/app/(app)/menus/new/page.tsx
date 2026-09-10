import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
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

  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, current_purchase_price")
    .eq("store_id", store.id)
    .order("name");

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
          currentPurchasePrice: i.current_purchase_price,
        }))}
        targetCostRate={store.defaultTargetCostRate}
      />
    </div>
  );
}
