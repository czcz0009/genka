import { Suspense } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import {
  buildFastDashboardSummary,
  getCurrentFlRate,
  getAlertSummary,
  type FastDashboardSummary,
} from "@/lib/dashboardSummary";
import { FL_BENCHMARK_PERCENT } from "@/lib/flRatio";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";

/** getSessionStore(RPC) が新規作成時に付ける仮の店舗名。まだ店名を設定していない目印として使う。 */
const DEFAULT_STORE_NAME = "マイ店舗";

type Status = "ok" | "warn" | "danger";

/**
 * 「NaN%」対策: nullだけでなく、万一の非数値(NaN/Infinity)もまとめて
 * フォールバック表示にする。売価・原価が未入力のメニューを含む場合の
 * 平均計算はsrc/lib/dashboardSummary.ts側で既にnullを返す設計だが、
 * 表示側でも二重に防御しておく。
 */
function formatPercent(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${n.toFixed(1)}%`;
}

function statusColor(rate: number, target: number): Status {
  if (rate <= target) return "ok";
  if (rate <= target + 5) return "warn";
  return "danger";
}

const STATUS_DOT_STYLE: Record<Status, string> = {
  ok: "var(--status-ok)",
  warn: "var(--status-warn)",
  danger: "var(--status-danger)",
};

function StatusDot({ status }: { status: Status }) {
  return <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: STATUS_DOT_STYLE[status] }} />;
}

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
            原価計算・値付けツール
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>個人飲食店向けの原価計算・メニュー値付けMVP。</p>
        </div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続です。<code className="rounded px-1 py-0.5 font-mono" style={{ background: "var(--muted)" }}>.env.local</code>
          を設定してください。
        </p>
      </main>
    );
  }

  const supabase = await createClient();

  const notLoggedInView = (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
          原価計算・値付けツール
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          個人飲食店向けの原価計算・メニュー値付けツール。メニューの原価率をすぐに見える化できます。
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex w-fit items-center gap-2 rounded px-6 py-4 text-base font-bold transition-colors"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        ログインして始める
      </Link>
    </main>
  );

  if (!supabase) {
    return notLoggedInView;
  }

  const session = await getSessionStore(supabase);

  if (session.status === "unauthenticated") {
    return notLoggedInView;
  }

  if (session.status === "error") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <StoreLoadError />
      </main>
    );
  }

  const { store } = session;

  // 「登録メニュー数・平均原価率・値上げ検討数」だけをここで待つ(速い)。
  // 「今月のFL比率」「仕入れ値アラート件数」は市場価格データ等の追加取得が必要で
  // 相対的に遅いため、下のSuspenseで個別に非同期表示し、ここでは待たない
  // (優先度3のパフォーマンス改善: 遅い集計がページ全体の表示をブロックしないようにする)。
  const summary = await buildFastDashboardSummary(supabase, store);

  if (summary.menuCount === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
          ようこそ
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          まずはメニューを登録して、原価率を確認できるようにしましょう。すでにExcel/CSVでレシピを管理しているなら取り込みが早いですが、なければ手入力からでも1分で始められます。
        </p>
        <StartHerePrompt />
      </main>
    );
  }

  const dashboardTitle = store.name === DEFAULT_STORE_NAME ? "ダッシュボード" : store.name;
  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
          {monthLabel} — {dashboardTitle}
        </div>
        <h1 className="mt-1 text-2xl font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
          今日の店舗状況
        </h1>
      </div>

      {/* 前回から変わったこと — 数値の羅列より先に、まず何を見るべきかを示す */}
      <Suspense fallback={<ChangesDigestSkeleton />}>
        <ChangesDigest supabase={supabase} store={store} summary={summary} />
      </Suspense>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            登録メニュー数
          </div>
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--foreground)" }}>
            {summary.menuCount}品
          </div>
        </div>
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            平均原価率
          </div>
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--foreground)" }}>
            {formatPercent(summary.averageCostRate)}
          </div>
        </div>
        <Link
          href="/menus"
          prefetch={false}
          className="rounded border p-4 text-left transition-colors hover:border-[color:var(--accent)]"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            値上げ検討
          </div>
          <div
            className="font-mono text-2xl font-bold leading-none"
            style={{ color: summary.overTargetCount > 0 ? "var(--status-danger)" : "var(--status-ok)" }}
          >
            {summary.overTargetCount}品
          </div>
        </Link>
        <Suspense fallback={<KpiCardSkeleton label="今月のFL比率" />}>
          <FlRatioKpiCard supabase={supabase} store={store} />
        </Suspense>
        <Suspense fallback={<KpiCardSkeleton label="未確認の仕入れ値アラート" />}>
          <AlertKpiCard supabase={supabase} store={store} />
        </Suspense>
      </div>

      {/* Quick links */}
      <div className="flex flex-col gap-3">
        <Link
          href="/menus"
          prefetch={false}
          className="rounded p-5 text-base font-bold transition-colors"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          メニュー一覧(原価計算)を見る
        </Link>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/ranking"
            prefetch={false}
            className="rounded border p-4 text-sm font-semibold transition-colors hover:border-[color:var(--accent)]"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            収益ランキングを見る
          </Link>
          <Link
            href="/fl-ratio"
            prefetch={false}
            className="rounded border p-4 text-sm font-semibold transition-colors hover:border-[color:var(--accent)]"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            FL比率を見る
          </Link>
          <Link
            href="/alerts"
            prefetch={false}
            className="rounded border p-4 text-sm font-semibold transition-colors hover:border-[color:var(--accent)]"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            仕入れ値アラートを見る
          </Link>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Excelで管理してる表がある場合は、
        <Link href="/import" prefetch={false} className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
          そこから取り込む
        </Link>
        こともできます。
      </p>
    </div>
  );
}

function ChangesDigestSkeleton() {
  return (
    <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div
        className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        前回から変わったこと
      </div>
      <div className="px-5 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
        確認中…
      </div>
    </div>
  );
}

interface DigestRow {
  status: Status;
  title: string;
  description: string;
  href: string;
}

async function ChangesDigest({
  supabase,
  store,
  summary,
}: {
  supabase: SupabaseClient;
  store: { id: string; defaultTargetCostRate: number };
  summary: FastDashboardSummary;
}) {
  // getAlertSummary/getCurrentFlRateはreactのcache()でメモ化されているため、
  // 下のKPIカード側からも同じ引数で呼ばれるが実際の計算・再取得は1回で済む。
  const [alertSummary, flRate] = await Promise.all([
    getAlertSummary(supabase, store),
    getCurrentFlRate(supabase, store),
  ]);

  const rows: DigestRow[] = [];

  if (summary.overTargetCount > 0) {
    rows.push({
      status: "danger",
      title: `${summary.overTargetCount}品が目標原価率を超えています`,
      description: "値上げを検討した方がよいメニューがあります。メニュー一覧で確認してください。",
      href: "/menus",
    });
  }

  for (const alert of alertSummary.topAlerts) {
    const severity: Status = Math.abs(alert.changePercent) >= 30 ? "danger" : "warn";
    const verb = alert.direction === "up" ? "値上がり" : "値下がり";
    const sign = alert.direction === "up" ? "+" : "";
    rows.push({
      status: severity,
      title: `${alert.ingredientName}が${verb}しています`,
      description:
        alert.affectedMenuNames.length > 0
          ? `変動率 ${sign}${alert.changePercent.toFixed(1)}%　影響メニュー: ${alert.affectedMenuNames.join("、")}`
          : `変動率 ${sign}${alert.changePercent.toFixed(1)}%`,
      href: "/alerts",
    });
  }

  if (flRate != null && Number.isFinite(flRate) && flRate > FL_BENCHMARK_PERCENT) {
    rows.push({
      status: flRate > FL_BENCHMARK_PERCENT + 10 ? "danger" : "warn",
      title: `FL比率が目安(${FL_BENCHMARK_PERCENT}%)を超えています`,
      description: `今月のFL比率 ${flRate.toFixed(1)}%。人件費・食材原価の見直しを検討してください。`,
      href: "/fl-ratio",
    });
  }

  return (
    <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div
        className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        前回から変わったこと
      </div>
      {rows.length === 0 ? (
        <div className="flex items-start gap-4 px-5 py-4">
          <StatusDot status="ok" />
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              順調です
            </div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              値上げ検討中のメニューや、目立った仕入れ値の変動は特にありません。
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {rows.map((row, i) => (
            <Link
              key={i}
              href={row.href}
              prefetch={false}
              className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-[color:var(--muted)]/50"
            >
              <StatusDot status={row.status} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                  {row.title}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {row.description}
                </div>
              </div>
              <div
                className="whitespace-nowrap text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--accent)" }}
              >
                詳細 →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCardSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        {label}
      </div>
      <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--muted-foreground)" }}>
        …
      </div>
    </div>
  );
}

async function FlRatioKpiCard({
  supabase,
  store,
}: {
  supabase: SupabaseClient;
  store: { id: string; defaultTargetCostRate: number };
}) {
  const flRate = await getCurrentFlRate(supabase, store);
  const status: Status | null = flRate != null && Number.isFinite(flRate) ? statusColor(flRate, FL_BENCHMARK_PERCENT) : null;
  return (
    <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        今月のFL比率
      </div>
      <div
        className="font-mono text-2xl font-bold leading-none"
        style={{ color: status ? STATUS_DOT_STYLE[status] : "var(--foreground)" }}
      >
        {formatPercent(flRate)}
      </div>
    </div>
  );
}

async function AlertKpiCard({
  supabase,
  store,
}: {
  supabase: SupabaseClient;
  store: { id: string; defaultTargetCostRate: number };
}) {
  const { count } = await getAlertSummary(supabase, store);
  return (
    <Link
      href="/alerts"
      prefetch={false}
      className="rounded border p-4 text-left transition-colors hover:border-[color:var(--accent)]"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        未確認の仕入れ値アラート
      </div>
      <div className="font-mono text-2xl font-bold leading-none" style={{ color: count > 0 ? "var(--status-warn)" : "var(--foreground)" }}>
        {count}件
      </div>
    </Link>
  );
}
