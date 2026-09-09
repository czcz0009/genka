"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuCostSummary } from "@/lib/types";
import type { RankingMenu } from "@/lib/menuRanking";
import { formatMonthLabel } from "@/lib/period/month";
import { saveManualSales } from "./actions.ts";
import { SalesImportPanel } from "./SalesImportPanel.tsx";

function formatYen(n: number | null): string {
  if (n == null) return "-";
  return `¥${Math.round(n).toLocaleString()}`;
}

export function RankingView({
  storeId,
  month,
  availableMonths,
  summaries,
  menus,
}: {
  storeId: string;
  month: string;
  availableMonths: string[];
  summaries: MenuCostSummary[];
  menus: RankingMenu[];
}) {
  const router = useRouter();
  const [showEntry, setShowEntry] = useState(false);
  const [entryTab, setEntryTab] = useState<"manual" | "csv">("manual");

  const monthOptions = useMemo(() => {
    const set = new Set(availableMonths);
    set.add(month);
    return Array.from(set).sort();
  }, [availableMonths, month]);

  const overTargetCount = summaries.filter((s) => s.overTarget).length;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          対象期間:
          <select
            value={month}
            onChange={(e) => router.push(`?month=${e.target.value}`)}
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setShowEntry((v) => !v)}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/20"
        >
          {showEntry ? "閉じる" : "販売数量を入力/取り込む"}
        </button>
      </div>

      {showEntry && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="mb-3 flex gap-2 text-sm">
            <button
              onClick={() => setEntryTab("manual")}
              className={`flex-1 rounded-lg border px-3 py-2.5 ${entryTab === "manual" ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-black/15 dark:border-white/20"}`}
            >
              手動入力
            </button>
            <button
              onClick={() => setEntryTab("csv")}
              className={`flex-1 rounded-lg border px-3 py-2.5 ${entryTab === "csv" ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-black/15 dark:border-white/20"}`}
            >
              CSV取り込み
            </button>
          </div>
          {entryTab === "manual" ? (
            <ManualSalesEntry
              storeId={storeId}
              month={month}
              menus={menus}
              summaries={summaries}
              onSaved={() => {
                setShowEntry(false);
                router.refresh();
              }}
            />
          ) : (
            <SalesImportPanel
              storeId={storeId}
              month={month}
              onSaved={() => {
                setShowEntry(false);
                router.refresh();
              }}
            />
          )}
        </div>
      )}

      {overTargetCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {overTargetCount}品が目標原価率を超えています。「値上げ検討」の目安額を確認してください。
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-medium">#</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">メニュー</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">販売数</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">売価</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">原価率</th>
              <th
                className="whitespace-nowrap px-3 py-2 text-right font-medium"
                title="販売数量 ×(売価−原価)。原価率が高くても数が出ないメニューより、実際に利益を多く生んでいるメニューが上位に来ます"
              >
                利益貢献度
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">値上げ検討</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s, idx) => (
              <tr key={s.menuId} className="border-t border-black/5 dark:border-white/5">
                <td className="whitespace-nowrap px-3 py-2 text-black/40 dark:text-white/40">{idx + 1}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{s.menuName}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{s.quantitySold}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{formatYen(s.sellingPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span
                    className={
                      s.overTarget
                        ? "font-medium text-red-600 dark:text-red-400"
                        : s.costRate != null
                          ? "text-black/70 dark:text-white/70"
                          : "text-black/30 dark:text-white/30"
                    }
                  >
                    {s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}
                  </span>
                  <span className="ml-1 text-black/30 dark:text-white/30">(目標{s.targetCostRate}%)</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{formatYen(s.profitContribution)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.overTarget && s.suggestedPriceIncrease ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      +{s.suggestedPriceIncrease}円が目安
                    </span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManualSalesEntry({
  storeId,
  month,
  menus,
  summaries,
  onSaved,
}: {
  storeId: string;
  month: string;
  menus: RankingMenu[];
  summaries: MenuCostSummary[];
  onSaved: () => void;
}) {
  const currentByMenuId = new Map(summaries.map((s) => [s.menuId, s.quantitySold]));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(menus.map((m) => [m.id, String(currentByMenuId.get(m.id) ?? 0)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const entries = menus.map((m) => ({ menuId: m.id, quantitySold: Number(values[m.id] || 0) }));
    const result = await saveManualSales({ storeId, month, entries });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/50 dark:text-white/50">
        {formatMonthLabel(month)}の販売数量を入力してください。
      </p>
      <div className="max-h-80 overflow-y-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <tbody>
            {menus.map((m) => (
              <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={values[m.id] ?? "0"}
                    onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                    className="w-24 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-right text-base dark:border-white/20"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving || menus.length === 0}
        className="self-end rounded-lg bg-black px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
