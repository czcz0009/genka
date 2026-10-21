"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MenuCostSummary } from "@/lib/types";
import { formatMonthLabel } from "@/lib/period/month";
import { SearchablePicker } from "@/components/SearchablePicker.tsx";
import { buildSalesSummary } from "@/lib/salesSummary";
import { saveManualSales } from "./actions.ts";
import { SalesImportPanel } from "./SalesImportPanel.tsx";

function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded border px-3 py-2.5 transition-colors"
      style={
        active
          ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
          : { borderColor: "var(--border)", color: "var(--foreground)" }
      }
    >
      {children}
    </button>
  );
}

/** 金額。計算できない(null)なら「-」。 */
function formatYenOrDash(n: number | null): string {
  return n == null ? "-" : formatYen(n);
}

function formatUnsetIngredientNames(names: { name: string; viaPrepItemName: string | null }[]): string {
  return names.map((n) => (n.viaPrepItemName ? `${n.name}(${n.viaPrepItemName}の材料)` : n.name)).join("、");
}

export function SalesView({
  storeId,
  month,
  availableMonths,
  summaries,
}: {
  storeId: string;
  month: string;
  availableMonths: string[];
  summaries: MenuCostSummary[];
}) {
  const router = useRouter();
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showEntry, setShowEntry] = useState(summaries.every((s) => s.quantitySold === 0));
  const [entryTab, setEntryTab] = useState<"manual" | "csv">("manual");

  const monthOptions = useMemo(() => {
    const set = new Set(availableMonths);
    set.add(month);
    return Array.from(set).sort();
  }, [availableMonths, month]);

  // 単価未設定の食材を含むメニューは原価率・利益を出さず、合計からも外す(salesSummary.ts)。
  const salesSummary = useMemo(() => buildSalesSummary(summaries), [summaries]);
  const { totals, unsetExcluded, noPriceExcluded, isPartial } = salesSummary;

  // 売上を把握する画面なので、対応優先度ではなく「実際の売上高が大きい順」に並べる
  // (今見直すべきメニュー画面とはあえて違う並び順にしている)。
  const sortedByRevenue = useMemo(
    () => [...salesSummary.rows].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)),
    [salesSummary],
  );

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => setShowMonthPicker((v) => !v)}
        className="self-start rounded border px-4 py-2.5 text-sm"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        対象月: {formatMonthLabel(month)}
      </button>

      {showMonthPicker && (
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <SearchablePicker
            options={monthOptions.map((m) => ({ value: m, label: formatMonthLabel(m) }))}
            value={month}
            onChange={(v) => {
              setShowMonthPicker(false);
              router.push(`?month=${v}`);
            }}
            searchPlaceholder="月で絞り込む"
            selectedLabelPrefix="対象期間"
          />
        </div>
      )}

      {/* サマリー: この月の売上・原価・利益を一目で見せる(このページの主目的)。
          合計から外したメニューがある時は、全体の売上と読まれないよう見出しと注記を出す。 */}
      <div className="flex flex-col gap-2">
      {isPartial && (
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          計算できたメニューの合計
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            実売上高
          </div>
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--foreground)" }}>
            {formatYenOrDash(totals.sales)}
          </div>
        </div>
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            原価(月間)
          </div>
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--foreground)" }}>
            {formatYenOrDash(totals.cost)}
          </div>
        </div>
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            利益
          </div>
          <div
            className="font-mono text-2xl font-bold leading-none"
            style={{
              color: totals.profit == null ? "var(--muted-foreground)" : totals.profit >= 0 ? "var(--status-ok)" : "var(--status-danger)",
            }}
          >
            {formatYenOrDash(totals.profit)}
          </div>
        </div>
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            原価率
          </div>
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: "var(--foreground)" }}>
            {totals.costRate != null ? `${totals.costRate.toFixed(1)}%` : "-"}
          </div>
        </div>
      </div>
      {unsetExcluded.menuCount > 0 && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          未計算{unsetExcluded.menuCount}品(売上{formatYen(unsetExcluded.salesAmount)})は含まれていません(単価が未設定の食材を使っているため)。
        </p>
      )}
      {noPriceExcluded.menuCount > 0 && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          売価が未設定のメニュー{noPriceExcluded.menuCount}品(販売{noPriceExcluded.quantitySold.toLocaleString()}食)は含まれていません。
        </p>
      )}
      </div>

      <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: "var(--muted)" }}>
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  メニュー
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  販売数量
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  売価
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  実売上高
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  原価率
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  利益
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedByRevenue.map((s) => {
                const revenue = s.revenue;
                return (
                  <tr key={s.menuId} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="min-w-[10rem] [overflow-wrap:anywhere] px-3 py-2.5 font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                      {s.menuName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono" style={{ color: "var(--muted-foreground)" }}>
                      {s.quantitySold}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono" style={{ color: "var(--foreground)" }}>
                      {s.sellingPrice != null ? formatYen(s.sellingPrice) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold" style={{ color: "var(--foreground)" }}>
                      {revenue != null ? formatYen(revenue) : "-"}
                    </td>
                    {s.status === "unset" ? (
                      // 単価未設定の食材を含むメニューは、原価率・利益を出さない(他の画面と同じ扱い)。
                      <td className="min-w-[16rem] px-3 py-2.5 text-xs" colSpan={2} style={{ color: "var(--muted-foreground)" }}>
                        計算できていません(未設定: {formatUnsetIngredientNames(s.unsetIngredients)})
                        <Link href="/ingredients" prefetch={false} className="ml-1 whitespace-nowrap underline underline-offset-2">
                          単価を設定する →
                        </Link>
                      </td>
                    ) : (
                      <>
                        <td
                          className="whitespace-nowrap px-3 py-2.5 text-right font-mono"
                          style={{ color: s.overTarget ? "var(--status-danger)" : "var(--foreground)" }}
                        >
                          {s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold"
                          style={{ color: s.profit != null && s.profit < 0 ? "var(--status-danger)" : "var(--foreground)" }}
                        >
                          {formatYenOrDash(s.profit)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 販売数量の入力・取り込みは補助的な機能なので、既定では畳んでおく
          (このページの主目的は上の売上・利益の把握のため)。まだ何も入力されて
          いない月は最初から開いておく。 */}
      <div>
        <button
          onClick={() => setShowEntry((v) => !v)}
          className="rounded border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          {showEntry ? "閉じる" : "販売数量を入力/取り込む"}
        </button>
        {showEntry && (
          <div className="mt-3 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-3 flex gap-2 text-sm">
              <TabButton active={entryTab === "manual"} onClick={() => setEntryTab("manual")}>
                手動入力
              </TabButton>
              <TabButton active={entryTab === "csv"} onClick={() => setEntryTab("csv")}>
                CSV取り込み
              </TabButton>
            </div>
            {entryTab === "manual" ? (
              <ManualSalesEntry storeId={storeId} month={month} summaries={summaries} onSaved={() => router.refresh()} />
            ) : (
              <SalesImportPanel storeId={storeId} month={month} onSaved={() => router.refresh()} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ManualSalesEntry({
  storeId,
  month,
  summaries,
  onSaved,
}: {
  storeId: string;
  month: string;
  summaries: MenuCostSummary[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(summaries.map((s) => [s.menuId, String(s.quantitySold)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const entries = summaries.map((s) => ({ menuId: s.menuId, quantitySold: Number(values[s.menuId] || 0) }));
    const result = await saveManualSales({ storeId, month, entries });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {formatMonthLabel(month)}の販売数量を入力してください。
      </p>
      <div className="max-h-96 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <tbody>
            {summaries.map((s) => (
              <tr key={s.menuId} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{s.menuName}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={values[s.menuId] ?? "0"}
                    onChange={(e) => setValues({ ...values, [s.menuId]: e.target.value })}
                    className="w-24 rounded border px-3 py-2 text-right font-mono text-base"
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm font-medium" style={{ color: "var(--status-ok)" }}>
          保存しました
        </p>
      )}
      <button
        onClick={handleSave}
        disabled={saving || summaries.length === 0}
        className="self-end rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
