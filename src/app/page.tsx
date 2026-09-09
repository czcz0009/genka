import { Suspense } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildFastDashboardSummary, getCurrentFlRate, getAlertCount } from "@/lib/dashboardSummary";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";

/** getOrCreateStore が新規作成時に付ける仮の店舗名。まだ店名を設定していない目印として使う。 */
const DEFAULT_STORE_NAME = "マイ店舗";

function formatPercent(n: number | null): string {
  return n == null ? "-" : `${n.toFixed(1)}%`;
}

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">原価計算・値付けツール</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            個人飲食店向けの原価計算・メニュー値付けMVP。
          </p>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Supabaseが未接続です。<code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.local</code>
          を設定してください。
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (!user || !supabase) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">原価計算・値付けツール</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            個人飲食店向けの原価計算・メニュー値付けツール。メニューの原価率をすぐに見える化できます。
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-black px-6 py-4 text-base font-medium text-white transition hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          ログインして始める
        </Link>
      </main>
    );
  }

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <StoreLoadError />
      </main>
    );
  }

  // 「登録メニュー数・平均原価率・値上げ検討数」だけをここで待つ(速い)。
  // 「今月のFL比率」「仕入れ値アラート件数」は市場価格データ等の追加取得が必要で
  // 相対的に遅いため、下のSuspenseで個別に非同期表示し、ここでは待たない
  // (優先度3のパフォーマンス改善: 遅い集計がページ全体の表示をブロックしないようにする)。
  const summary = await buildFastDashboardSummary(supabase, store);

  if (summary.menuCount === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">ようこそ</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          まずはメニューを登録して、原価率を確認できるようにしましょう。すでにExcel/CSVでレシピを管理しているなら取り込みが早いですが、なければ手入力からでも1分で始められます。
        </p>
        <StartHerePrompt />
      </main>
    );
  }

  const dashboardTitle = store.name === DEFAULT_STORE_NAME ? "ダッシュボード" : store.name;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">{dashboardTitle}</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">登録メニュー数: {summary.menuCount}件</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-xs text-black/50 dark:text-white/50">平均原価率</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{formatPercent(summary.averageCostRate)}</p>
        </div>
        <Suspense fallback={<SummaryCardSkeleton label="今月のFL比率" />}>
          <FlRatioCard supabase={supabase} store={store} />
        </Suspense>
        <Link
          href="/menus"
          prefetch={false}
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          <p className="text-xs text-black/50 dark:text-white/50">値上げ検討中のメニュー</p>
          <p
            className={`mt-1 text-xl font-bold tracking-tight ${summary.overTargetCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {summary.overTargetCount}件
          </p>
        </Link>
        <Suspense fallback={<SummaryCardSkeleton label="未確認の仕入れ値アラート" />}>
          <AlertCountCard supabase={supabase} store={store} />
        </Suspense>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/menus"
          prefetch={false}
          className="rounded-lg bg-black p-5 text-base font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          メニュー一覧(原価計算)を見る
        </Link>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/ranking"
            prefetch={false}
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            収益ランキングを見る
          </Link>
          <Link
            href="/fl-ratio"
            prefetch={false}
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            FL比率を見る
          </Link>
          <Link
            href="/alerts"
            prefetch={false}
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            仕入れ値アラートを見る
          </Link>
        </div>
      </div>

      <p className="mt-6 text-sm text-black/40 dark:text-white/40">
        Excelで管理してる表がある場合は、
        <Link href="/import" prefetch={false} className="underline underline-offset-2 hover:text-black dark:hover:text-white">
          そこから取り込む
        </Link>
        こともできます。
      </p>
    </main>
  );
}

function SummaryCardSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-black/20 dark:text-white/20">…</p>
    </div>
  );
}

async function FlRatioCard({
  supabase,
  store,
}: {
  supabase: SupabaseClient;
  store: { id: string; defaultTargetCostRate: number };
}) {
  const flRate = await getCurrentFlRate(supabase, store);
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50">今月のFL比率</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{formatPercent(flRate)}</p>
    </div>
  );
}

async function AlertCountCard({
  supabase,
  store,
}: {
  supabase: SupabaseClient;
  store: { id: string; defaultTargetCostRate: number };
}) {
  const alertCount = await getAlertCount(supabase, store);
  return (
    <Link
      href="/alerts"
      prefetch={false}
      className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
    >
      <p className="text-xs text-black/50 dark:text-white/50">未確認の仕入れ値アラート</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight ${alertCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
      >
        {alertCount}件
      </p>
    </Link>
  );
}
