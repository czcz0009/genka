import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { selectApplicableFixedCost, type FixedCostRow } from "@/lib/flRatio";
import { monthToPeriod, currentMonthString } from "@/lib/period/month";
import { SettingsForm } from "./SettingsForm.tsx";
import { AccountDeletionSection } from "./AccountDeletionSection.tsx";
import { getPendingAccountDeletion } from "./accountDeletionActions.ts";
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
  const pendingDeletion = await getPendingAccountDeletion();

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
        currentRent={currentRent}
        initialIngredientPriceTaxMode={store.ingredientPriceTaxMode}
      />

      {/* カテゴリの編集画面への入口(もう1つの入口は、メニュー一覧・食材一覧のタブ行の「カテゴリを編集」) */}
      <section className="space-y-2 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          カテゴリ
        </h2>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          メニュー一覧・食材一覧のタブに使うカテゴリを、追加・名前の変更・並び替え・削除できます。
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/categories?kind=menu" prefetch={false} className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            メニューのカテゴリを編集 →
          </Link>
          <Link href="/categories?kind=ingredient" prefetch={false} className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            食材のカテゴリを編集 →
          </Link>
        </div>
      </section>

      <AccountDeletionSection hasPendingDeletion={pendingDeletion != null} />
    </div>
  );
}
