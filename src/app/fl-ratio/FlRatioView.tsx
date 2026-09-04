"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
          className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RatioCard label="F比率(食材原価)" value={formatPercent(current.foodCostRate)} />
        <RatioCard label="L比率(人件費)" value={formatPercent(current.laborCostRate)} />
        <RatioCard label="FL比率" value={formatPercent(current.flRate)} severity={current.flSeverity} />
        <RatioCard label="FLR比率" value={formatPercent(current.flrRate)} severity={current.flrSeverity} />
      </div>

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
  const [labor, setLabor] = useState(currentLabor != null ? String(currentLabor) : "");
  const [rent, setRent] = useState(currentRent != null ? String(currentRent) : "");
  const [saving, setSaving] = useState<"labor" | "rent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(costType: "labor" | "rent") {
    const amount = Number(costType === "labor" ? labor : rent);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("金額を正しく入力してください");
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

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="mb-3 text-sm font-semibold">{formatMonthLabel(month)}の固定費</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 text-sm">
          人件費(月次)
          <input
            type="number"
            min={0}
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            placeholder="例: 400000"
            className="w-32 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          />
          円
          <button
            onClick={() => handleSave("labor")}
            disabled={saving === "labor"}
            className="rounded border border-black/15 px-3 py-1 text-xs disabled:opacity-40 dark:border-white/20"
          >
            {saving === "labor" ? "保存中…" : "保存"}
          </button>
        </label>
        <label className="flex flex-1 items-center gap-2 text-sm">
          家賃(月額・継続)
          <input
            type="number"
            min={0}
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            placeholder="例: 180000"
            className="w-32 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          />
          円
          <button
            onClick={() => handleSave("rent")}
            disabled={saving === "rent"}
            className="rounded border border-black/15 px-3 py-1 text-xs disabled:opacity-40 dark:border-white/20"
          >
            {saving === "rent" ? "保存中…" : "保存"}
          </button>
        </label>
      </div>
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">
        家賃は一度登録すれば、金額が変わるまで翌月以降にも引き継がれます。人件費は月ごとに入力してください。
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
