"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MenuCostSummary } from "@/lib/types";
import { formatMonthLabel } from "@/lib/period/month";
import { SearchablePicker } from "@/components/SearchablePicker.tsx";
import { Notice } from "@/components/Notice.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";

function formatYen(n: number | null): string {
  if (n == null) return "-";
  return `¥${Math.round(n).toLocaleString()}`;
}

/** 月間の利益への影響額(円)専用のフォーマッタ。符号を明示する(+値上がり損/-値下がり得、ではなくその逆)。 */
function formatSignedYen(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "¥0";
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}¥${Math.abs(rounded).toLocaleString()}`;
}

export function RankingView({
  month,
  availableMonths,
  summaries,
  headroomMenus,
}: {
  month: string;
  availableMonths: string[];
  summaries: MenuCostSummary[];
  /** 原価率が目標より大幅に低い、値上げ余地のあるメニュー(「今見直すべきメニュー」と対になる一覧)。 */
  headroomMenus: MenuCostSummary[];
}) {
  const router = useRouter();
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
        {/*
          以前はここに販売数量の入力フォームを埋め込んでいたが、独立した居場所が
          無く見つけにくい・使いにくいという指摘を受けて「売上管理」画面に分離した。
        */}
        <Link
          href={`/sales?month=${month}`}
          prefetch={false}
          className="rounded border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          売上管理で販売数量を入力する →
        </Link>
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

      {overTargetCount > 0 && (
        <Notice tone="warn">
          {overTargetCount}品が目標原価率を超えています。対応の優先度が高い順に上から並んでいるので、上のメニューから確認してください。
        </Notice>
      )}

      <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: "var(--muted)" }}>
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>#</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>メニュー</th>
                <th
                  className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                  title="売価は税込金額として扱います"
                >
                  売価
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>原価率</th>
                <th
                  className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                  title="販売数量 ×(売価−原価)。原価率が高くても数が出ないメニューより、実際に利益を多く生んでいるメニューが上位に来ます。販売数量は「売上管理」で入力します"
                >
                  利益貢献度
                </th>
                <th
                  className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                  title="仕入単価が前回の記録から変わったことによる、月間の利益への影響額。(従来の原価-現在の原価)×月間販売数量"
                >
                  月間影響額
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>値上げ目安</th>
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
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">
                    {s.monthlyProfitImpact == null ? (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }} title="販売数量を「売上管理」で登録すると表示されます">
                        -
                      </span>
                    ) : (
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            s.monthlyProfitImpact < 0
                              ? "var(--status-danger)"
                              : s.monthlyProfitImpact > 0
                                ? "var(--status-ok)"
                                : "var(--muted-foreground)",
                        }}
                      >
                        {formatSignedYen(s.monthlyProfitImpact)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.overTarget && s.suggestedPriceIncrease ? (
                      <StatusBadge status="danger" label={`+${s.suggestedPriceIncrease}円が目安`} />
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

      {headroomMenus.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              まだ活かせていない伸びしろ
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              原価率が目標より大幅に低いメニューです。既に目標より高い利益率を確保できているため、値上げしてもまだ受け入れられる可能性があります。具体的な金額は、各メニューの編集画面にある値上げシミュレーションで試してみてください。
            </p>
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
                      原価率
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                      目標との差
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {headroomMenus.map((s) => (
                    <tr key={s.menuId} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                        {s.menuName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <span className="font-mono font-semibold" style={{ color: "var(--status-ok)" }}>
                          {s.costRate!.toFixed(1)}%
                        </span>
                        <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                          (目標{s.targetCostRate}%)
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold" style={{ color: "var(--status-ok)" }}>
                        -{(s.targetCostRate - s.costRate!).toFixed(1)}pt
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <Link
                          href={`/menus/${s.menuId}`}
                          prefetch={false}
                          className="text-sm underline underline-offset-2"
                          style={{ color: "var(--accent)" }}
                        >
                          試してみる →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
