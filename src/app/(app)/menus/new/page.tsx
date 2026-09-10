import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { MenuEditor } from "../MenuEditor.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";

export const metadata: Metadata = {
  title: "メニューを登録",
};

export default async function NewMenuPage() {
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
        <StoreLoadError />
      </main>
    );
  }

  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, current_purchase_price")
    .eq("store_id", store.id)
    .order("name");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">メニューを登録</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        メニュー名・売価・使う食材を、この1画面でまとめて登録できます。食材は後から追加・削除もできます。
      </p>

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
    </main>
  );
}
