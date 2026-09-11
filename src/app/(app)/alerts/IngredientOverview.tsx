import { DEFAULT_CHANGE_THRESHOLD_PERCENT } from "@/lib/marketPrices/detectPriceChanges.ts";
import type { IngredientOverviewRow } from "@/lib/marketPrices/buildIngredientOverview.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";

function formatPricePerKg(n: number): string {
  return `¥${Math.round(n).toLocaleString()}/kg`;
}

function formatChangePercent(n: number): string {
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function OverviewRow({ row }: { row: IngredientOverviewRow }) {
  // 変動率の絶対値がアラート検知と同じ閾値を超えていれば「強調」する。
  // (この一覧の強調と、下の「価格変動アラート」セクションが同じ基準で
  // 連動するようにするため、閾値をdetectPriceChanges.tsと共有している)
  const notable = row.changePercent != null && Math.abs(row.changePercent) >= DEFAULT_CHANGE_THRESHOLD_PERCENT;
  const highlightColor = notable ? (row.direction === "up" ? "var(--status-danger)" : "var(--accent)") : "var(--border)";

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 rounded border px-4 py-3 text-sm"
      style={{
        borderColor: "var(--border)",
        borderLeft: `4px solid ${highlightColor}`,
        background: notable ? `color-mix(in srgb, ${highlightColor} 6%, var(--card))` : "var(--card)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          {row.ingredientName}
        </span>
        {row.itemName && (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            市場「{row.itemName}」{row.status === "needsReview" && "(推定・未確認)"}
          </span>
        )}
        {row.status === "needsSetup" && (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            <a href="#livestock-settings" className="underline underline-offset-2">
              下の設定
            </a>
            から規格を選ぶと追跡できます
          </span>
        )}
        {row.status === "untracked" && (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            この食材は追跡対象外です(国の統計データに一致する品目が見つかりません)
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {row.currentPricePerKg != null && (
          <span className="font-mono text-sm" style={{ color: "var(--foreground)" }}>
            {formatPricePerKg(row.currentPricePerKg)}
          </span>
        )}
        {row.changePercent != null ? (
          <StatusBadge
            status={notable ? (row.direction === "up" ? "danger" : "ok") : "muted"}
            label={`前回比 ${formatChangePercent(row.changePercent)}`}
          />
        ) : row.status === "tracked" || row.status === "needsReview" ? (
          <StatusBadge status="muted" label="比較データなし" />
        ) : row.status === "needsSetup" ? (
          <StatusBadge status="warn" label="設定が必要です" />
        ) : (
          <StatusBadge status="muted" label="追跡対象外" />
        )}
      </div>
    </li>
  );
}

/**
 * 「登録済み食材とその現在の市場価格・追跡状況の一覧」セクション。
 * 変動検知(アラート)のセクションとは別に、まずここで全体を把握できるようにする。
 * 大きく変動した食材(閾値超え)は左枠線と背景色で強調される。
 */
export function IngredientOverview({ rows }: { rows: IngredientOverviewRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        登録食材の追跡状況({rows.length}件)
      </h2>
      <p className="mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
        国の市場価格データと対応づけられた食材の、直近の卸売価格と前回比です。大きく変動した食材は色付きで強調しています。
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <OverviewRow key={row.ingredientId} row={row} />
        ))}
      </ul>
    </section>
  );
}
