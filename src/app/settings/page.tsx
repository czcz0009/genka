import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { selectApplicableFixedCost, type FixedCostRow } from "@/lib/flRatio";
import { monthToPeriod, currentMonthString, formatMonthLabel } from "@/lib/period/month";
import { SettingsForm } from "./SettingsForm.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";

export const metadata: Metadata = {
  title: "店舗設定",
};

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight">店舗設定</h1>
        <p className="mt-4 text-sm text-black/60 dark:text-white/60">
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </main>
    );
  }

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
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <h1 className="text-xl font-bold tracking-tight">店舗設定</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        すべて任意です。設定しなくてもツールは使えますが、設定すると原価率の目安判定やFL比率がより正確になります。
      </p>

      <SettingsForm
        storeId={store.id}
        initialName={store.name}
        initialDefaultTargetCostRate={store.defaultTargetCostRate}
        initialRent={currentRent}
        initialLabor={currentLabor}
        month={month}
        monthLabel={formatMonthLabel(month)}
      />
    </main>
  );
}
