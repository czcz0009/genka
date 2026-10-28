import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { OCR_MONTHLY_USE_LIMIT, jstMonthKey, remainingOcrUses } from "@/lib/invoiceOcr/usageLimit.ts";
import { ScanView, type ExistingIngredientOption, type RememberedConversion, type CostData, type NameAlias } from "./ScanView.tsx";
import { DUPLICATE_LOOKBACK_DAYS, daysAgoKey, type InvoiceRecord } from "@/lib/invoiceOcr/duplicateInvoice.ts";

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
    .select("id, name, unit, current_purchase_price, price_is_set, yield_rate_percent")
    .eq("store_id", store.id)
    .eq("is_prep_item", false)
    .order("name");

  // 今月(日本時間)の成功回数。月ごとの数え方はマイグレーション0029(2026-10-27)
  const { data: usage } = await supabase
    .from("ocr_usage_monthly")
    .select("used_count")
    .eq("month", jstMonthKey(new Date()))
    .maybeSingle();
  const initialRemaining = remainingOcrUses(usage?.used_count ?? 0, OCR_MONTHLY_USE_LIMIT);

  // 覚えた換算と、二度読みに気づくための記録(マイグレーション0031、2026-10-28)。
  // 0031をまだ当てていない・読めないときは、無いものとして画面を出す(読み取り自体は止めない)。
  const { data: conversionRows } = await supabase.from("ingredient_unit_conversions").select("ingredient_id, purchase_unit, amount, amount_unit");
  // 覚えた名前の対応(マイグレーション0032、2026-10-28)。読めなければ、無いものとして画面を出す
  const { data: aliasRows } = await supabase.from("ingredient_name_aliases").select("ingredient_id, normalized_alias").eq("store_id", store.id);
  const since = daysAgoKey(new Date(), DUPLICATE_LOOKBACK_DAYS);
  const { data: recordRows } = await supabase
    .from("invoice_scan_records")
    .select("invoice_date, supplier_normalized, total_amount, created_at")
    .eq("store_id", store.id)
    .gte("invoice_date", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  // 完了画面「原価率が変わったメニュー」の計算に使う(2026-10-28)。読めなければ、その一覧だけ出さない
  const storeData = await getStoreData(supabase);
  const costData: CostData | null = storeData
    ? {
        menus: storeData.menus.map((m) => ({ id: m.id, name: m.name, sellingPrice: m.sellingPrice, targetCostRate: m.targetCostRate })),
        ingredients: storeData.ingredients,
        menuIngredients: storeData.menuIngredients,
        prepItemComponents: storeData.prepItemComponents,
        defaultTargetCostRate: store.defaultTargetCostRate,
      }
    : null;

  const existingIngredients: ExistingIngredientOption[] = (ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    currentPurchasePrice: i.current_purchase_price,
    priceIsSet: i.price_is_set !== false,
    yieldRatePercent: i.yield_rate_percent,
  }));
  const rememberedConversions: RememberedConversion[] = (conversionRows ?? []).map((c) => ({
    ingredientId: c.ingredient_id,
    purchaseUnit: c.purchase_unit,
    amount: Number(c.amount),
    unit: c.amount_unit,
  }));
  const nameAliases: NameAlias[] = (aliasRows ?? []).map((a) => ({ ingredientId: a.ingredient_id, normalizedAlias: a.normalized_alias }));
  const invoiceRecords: InvoiceRecord[] = (recordRows ?? []).map((r) => ({
    invoiceDate: r.invoice_date,
    supplierNormalized: r.supplier_normalized,
    totalAmount: Number(r.total_amount),
    createdAt: r.created_at,
  }));

  return (
    <div className="max-w-2xl p-6 md:p-8">
      <PageHeader
        eyebrow="食材"
        title="納品書から読み取る"
        description="納品書・請求書を写真で撮るか、写真・PDFを選んでアップロードすると、AIが食材名・数量・単価を読み取ります。読み取り結果は必ずこの画面で確認・修正してから登録されます(自動では確定しません)。印刷された文字が中心の書類を対象としています(手書きの伝票は対象外です)。"
      />
      <ScanView
        storeId={store.id}
        storeTaxMode={store.ingredientPriceTaxMode}
        existingIngredients={existingIngredients}
        rememberedConversions={rememberedConversions}
        invoiceRecords={invoiceRecords}
        costData={costData}
        nameAliases={nameAliases}
        initialRemaining={initialRemaining}
      />
    </div>
  );
}
