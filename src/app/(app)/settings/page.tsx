import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { selectApplicableFixedCost, type FixedCostRow } from "@/lib/flRatio";
import { monthToPeriod, currentMonthString, formatMonthLabel } from "@/lib/period/month";
import { SettingsForm } from "./SettingsForm.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "店舗設定",
};

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="設定" title="店舗設定" />
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
      <div className="max-w-xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const month = currentMonthString();
  const period = monthToPeriod(month);
  const { data: fixedCosts } = await supabase
    .from("store_fixed_costs")
    .select("cost_type, amount, period_start, period_end")
    .eq("store_id", store.id);

  const fixedCostRows: FixedCostRow[] = (fixedCosts ?? []).map((f) => ({
    costType: f.cost_type,
    amount: f.amount,
    periodStart: f.period_start,
    periodEnd: f.period_end,
  }));
  const currentRent = selectApplicableFixedCost(fixedCostRows, "rent", period);
  const currentLabor = selectApplicableFixedCost(fixedCostRows, "labor", period);

  return (
    <div className="max-w-xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="設定"
        title="店舗設定"
        description="すべて任意です。設定しなくてもツールは使えますが、設定すると原価率の目安判定やFL比率がより正確になります。"
      />

      <SettingsForm
        storeId={store.id}
        initialName={store.name}
        initialDefaultTargetCostRate={store.defaultTargetCostRate}
        initialRent={currentRent}
        initialLabor={currentLabor}
        month={month}
        monthLabel={formatMonthLabel(month)}
      />
    </div>
  );
}
