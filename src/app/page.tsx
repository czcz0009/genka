import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildDashboardSummary } from "@/lib/dashboardSummary";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";

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
        <p className="text-sm text-red-600 dark:text-red-400">店舗情報の取得に失敗しました。</p>
      </main>
    );
  }

  const summary = await buildDashboardSummary(supabase, store);

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
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-xs text-black/50 dark:text-white/50">今月のFL比率</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{formatPercent(summary.flRate)}</p>
        </div>
        <Link
          href="/menus"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          <p className="text-xs text-black/50 dark:text-white/50">値上げ検討中のメニュー</p>
          <p
            className={`mt-1 text-xl font-bold tracking-tight ${summary.overTargetCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {summary.overTargetCount}件
          </p>
        </Link>
        <Link
          href="/alerts"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          <p className="text-xs text-black/50 dark:text-white/50">未確認の仕入れ値アラート</p>
          <p
            className={`mt-1 text-xl font-bold tracking-tight ${summary.alertCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {summary.alertCount}件
          </p>
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/menus"
          className="rounded-lg bg-black p-5 text-base font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          メニュー一覧(原価計算)を見る
        </Link>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/ranking"
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            収益ランキングを見る
          </Link>
          <Link
            href="/fl-ratio"
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            FL比率を見る
          </Link>
          <Link
            href="/alerts"
            className="rounded-lg border border-black/15 p-4 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            仕入れ値アラートを見る
          </Link>
        </div>
      </div>

      <p className="mt-6 text-sm text-black/40 dark:text-white/40">
        Excelで管理してる表がある場合は、
        <Link href="/import" className="underline underline-offset-2 hover:text-black dark:hover:text-white">
          そこから取り込む
        </Link>
        こともできます。
      </p>
    </main>
  );
}
