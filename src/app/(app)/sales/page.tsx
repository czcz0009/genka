import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { computeMonthlyMenuSummaries } from "@/lib/monthlyMenuSummaries";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { SalesView } from "./SalesView.tsx";

export const metadata: Metadata = {
  title: "売上管理",
};

/**
 * 売上を把握するための画面。
 *
 * 「入力ページ」ではなく「どのメニューがどれくらい売れて、実際の売上・
 * 利益・原価率がどれくらいか」を見る画面にする(販売数量の入力・取り込みは
 * 補助的な機能として折りたたんでおく)。原価率・利益の計算は「今見直すべき
 * メニュー」画面と全く同じロジック(computeMonthlyMenuSummaries)を使う。
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-6xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="売上" title="売上管理" />
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
      <div className="max-w-6xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const { month: monthParam } = await searchParams;
  const result = await computeMonthlyMenuSummaries(supabase, store, monthParam);

  if (!result) {
    return (
      <div className="max-w-6xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="売上" title="売上管理" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューを登録すると、月ごとの売上・利益がここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }
  const { month, availableMonths, summaries } = result;

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="売上"
        title="売上管理"
        description="どのメニューがどれくらい売れて、実際の売上・利益・原価率がどれくらいかを月ごとに確認できます。販売数量の入力・取り込みは下部にあります。"
      />
      <SalesView storeId={store.id} month={month} availableMonths={availableMonths} summaries={summaries} />
    </div>
  );
}
