import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { ScanView, type ExistingIngredientOption } from "./ScanView.tsx";

export const metadata: Metadata = {
  title: "納品書から読み取る",
};

export default async function ScanInvoicePage() {
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

  // 仕込み品(is_prep_item=true)は仕入単価を直接編集できないため、
  // 読み取り結果との突き合わせ対象からは除外する。
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, current_purchase_price, yield_rate_percent")
    .eq("store_id", store.id)
    .eq("is_prep_item", false)
    .order("name");

  const existingIngredients: ExistingIngredientOption[] = (ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    currentPurchasePrice: i.current_purchase_price,
    yieldRatePercent: i.yield_rate_percent,
  }));

  return (
    <div className="max-w-2xl p-6 md:p-8">
      <PageHeader
        eyebrow="食材"
        title="納品書から読み取る"
        description="納品書・請求書を写真で撮ってアップロードすると、AIが食材名・数量・単価を読み取ります。読み取り結果は必ずこの画面で確認・修正してから登録されます(自動では確定しません)。印刷された文字が中心の書類を対象としています(手書きの伝票は対象外です)。"
      />
      <ScanView storeId={store.id} existingIngredients={existingIngredients} />
    </div>
  );
}
