"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMonthLabel } from "@/lib/period/month";
import type { Severity } from "@/lib/flRatio";
import { saveFixedCost } from "./actions.ts";
import { FlRatioChart, type TrendPoint } from "./FlRatioChart.tsx";

const SEVERITY_STYLE: Record<Severity, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  caution: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const SEVERITY_LABEL: Record<Severity, string> = { normal: "正常", caution: "注意", danger: "危険" };

function formatPercent(n: number | null): string {
  return n == null ? "-" : `${n.toFixed(1)}%`;
}

export function FlRatioView({
  storeId,
  month,
  current,
  trend,
  currentLabor,
  currentRent,
}: {
  storeId: string;
  month: string;
  current: TrendPoint;
  trend: TrendPoint[];
  currentLabor: number | null;
  currentRent: number | null;
}) {
  const router = useRouter();

  return (
    <div className="mt-8 flex flex-col gap-6">
      <label className="flex items-center gap-2 text-sm">
        対象月:
        <input
          type="month"
          value={month}
          onChange={(e) => router.push(`?month=${e.target.value}`)}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RatioCard label="F比率(食材原価)" value={formatPercent(current.foodCostRate)} />
        <RatioCard label="L比率(人件費)" value={formatPercent(current.laborCostRate)} />
        <RatioCard label="FL比率" value={formatPercent(current.flRate)} severity={current.flSeverity} />
        <RatioCard label="FLR比率" value={formatPercent(current.flrRate)} severity={current.flrSeverity} />
      </div>
      <p className="-mt-3 text-xs text-black/40 dark:text-white/40">
        FL比率 = (食材原価 + 人件費)÷ 売上。FLR比率 = そこにさらに家賃を加えたものの割合です。
      </p>

      <FixedCostEntry storeId={storeId} month={month} currentLabor={currentLabor} currentRent={currentRent} />

      <section>
        <h2 className="mb-2 text-sm font-semibold">月次推移</h2>
        <FlRatioChart trend={trend} />
      </section>
    </div>
  );
}

function RatioCard({ label, value, severity }: { label: string; value: string; severity?: Severity | null }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-2xl font-bold">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
        {severity && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_STYLE[severity]}`}>
            {SEVERITY_LABEL[severity]}
          </span>
        )}
      </div>
    </div>
  );
}

function FixedCostEntry({
  storeId,
  month,
  currentLabor,
  currentRent,
}: {
  storeId: string;
  month: string;
  currentLabor: number | null;
  currentRent: number | null;
}) {
  const router = useRouter();
  // 未設定(初めてこの画面を見る等)なら最初から開いておき、設定済みなら
  // 「原価率を見る」という本来の1画面1タスクを崩さないよう畳んでおく。
  const [open, setOpen] = useState(currentLabor == null && currentRent == null);
  const [labor, setLabor] = useState(currentLabor != null ? String(currentLabor) : "");
  const [rent, setRent] = useState(currentRent != null ? String(currentRent) : "");
  const [saving, setSaving] = useState<"labor" | "rent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(costType: "labor" | "rent") {
    const amount = Number(costType === "labor" ? labor : rent);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("0以上の数値で入力してください");
      return;
    }
    setSaving(costType);
    setError(null);
    const result = await saveFixedCost({ storeId, costType, month, amount });
    setSaving(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-black/15 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        {formatMonthLabel(month)}の家賃・人件費を編集する
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{formatMonthLabel(month)}の固定費</p>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-black/40 underline underline-offset-2 hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          閉じる
        </button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-2 text-sm sm:flex-row sm:items-center">
          <span className="shrink-0">人件費(月次)</span>
          <div className="flex flex-1 items-center gap-2">
            <input
              type="number"
              min={0}
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
              placeholder="例: 400000"
              className="w-full min-w-0 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
            <span className="shrink-0">円</span>
            <button
              onClick={() => handleSave("labor")}
              disabled={saving === "labor"}
              className="shrink-0 rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
            >
              {saving === "labor" ? "保存中…" : "保存"}
            </button>
          </div>
        </label>
        <label className="flex flex-1 flex-col gap-2 text-sm sm:flex-row sm:items-center">
          <span className="shrink-0">家賃(月額・継続)</span>
          <div className="flex flex-1 items-center gap-2">
            <input
              type="number"
              min={0}
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="例: 180000"
              className="w-full min-w-0 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
            <span className="shrink-0">円</span>
            <button
              onClick={() => handleSave("rent")}
              disabled={saving === "rent"}
              className="shrink-0 rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
            >
              {saving === "rent" ? "保存中…" : "保存"}
            </button>
          </div>
        </label>
      </div>
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">
        家賃は一度登録すれば、金額が変わるまで翌月以降にも引き継がれます。人件費は月ごとに入力してください。今月分だけでよければ、
        <Link href="/settings" className="underline underline-offset-2 hover:text-black dark:hover:text-white">
          店舗設定
        </Link>
        からも入力できます。
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
