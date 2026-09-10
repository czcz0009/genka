"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuCostSummary } from "@/lib/types";
import type { RankingMenu } from "@/lib/menuRanking";
import { formatMonthLabel } from "@/lib/period/month";
import { SearchablePicker } from "@/components/SearchablePicker.tsx";
import { Notice } from "@/components/Notice.tsx";
import { saveManualSales } from "./actions.ts";
import { SalesImportPanel } from "./SalesImportPanel.tsx";

function formatYen(n: number | null): string {
  if (n == null) return "-";
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
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const monthOptions = useMemo(() => {
    const set = new Set(availableMonths);
    set.add(month);
    return Array.from(set).sort();
  }, [availableMonths, month]);

  const overTargetCount = summaries.filter((s) => s.overTarget).length;
  const maxProfit = Math.max(...summaries.map((s) => s.profitContribution ?? 0), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* ネイティブの<select>は見づらいという指摘を受け、他画面と同じ検索
            絞り込みつきの一覧(SearchablePicker)に統一。常時表示すると場所を
            取るため、ボタンを押した時だけ下に展開する。 */}
        <button
          onClick={() => setShowMonthPicker((v) => !v)}
          className="rounded border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          対象期間: {formatMonthLabel(month)}
        </button>
        <button
          onClick={() => setShowEntry((v) => !v)}
          className="rounded border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          {showEntry ? "閉じる" : "販売数量を入力/取り込む"}
        </button>
      </div>

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

      {showEntry && (
        <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-3 flex gap-2 text-sm">
            <TabButton active={entryTab === "manual"} onClick={() => setEntryTab("manual")}>
              手動入力
            </TabButton>
            <TabButton active={entryTab === "csv"} onClick={() => setEntryTab("csv")}>
              CSV取り込み
            </TabButton>
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
        <Notice tone="warn">{overTargetCount}品が目標原価率を超えています。「値上げ検討」の目安額を確認してください。</Notice>
      )}

      <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: "var(--muted)" }}>
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>#</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>メニュー</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>販売数</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>売価</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>原価率</th>
                <th
                  className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                  title="販売数量 ×(売価−原価)。原価率が高くても数が出ないメニューより、実際に利益を多く生んでいるメニューが上位に来ます"
                >
                  利益貢献度
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>値上げ検討</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, idx) => (
                <tr key={s.menuId} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs" style={{ color: idx === 0 ? "var(--accent)" : "var(--muted-foreground)" }}>
                    {idx + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                    {s.menuName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono" style={{ color: "var(--muted-foreground)" }}>
                    {s.quantitySold}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono" style={{ color: "var(--foreground)" }}>
                    {formatYen(s.sellingPrice)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <span
                      className="font-mono font-semibold"
                      style={{
                        color: s.overTarget ? "var(--status-danger)" : s.costRate != null ? "var(--status-ok)" : "var(--muted-foreground)",
                      }}
                    >
                      {s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}
                    </span>
                    <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      (目標{s.targetCostRate}%)
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold" style={{ color: "var(--foreground)" }}>
                    {formatYen(s.profitContribution)}
                    {maxProfit > 0 && (s.profitContribution ?? 0) > 0 && (
                      <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${((s.profitContribution ?? 0) / maxProfit) * 100}%`,
                            background: idx === 0 ? "var(--accent)" : "var(--primary)",
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.overTarget && s.suggestedPriceIncrease ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: "color-mix(in srgb, var(--status-warn) 15%, var(--card))", color: "var(--status-warn)" }}
                      >
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
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {formatMonthLabel(month)}の販売数量を入力してください。
      </p>
      <div className="max-h-80 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <tbody>
            {menus.map((m) => (
              <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{m.name}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={values[m.id] ?? "0"}
                    onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
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
      <button
        onClick={handleSave}
        disabled={saving || menus.length === 0}
        className="self-end rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
