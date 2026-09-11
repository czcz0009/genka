import type { MarketPriceAlert } from "@/lib/marketPrices/generateAlerts";
import { StatusBadge } from "@/components/StatusBadge.tsx";

function AlertCard({ alert }: { alert: MarketPriceAlert }) {
  const up = alert.direction === "up";
  const color = up ? "var(--status-danger)" : "var(--accent)";
  return (
    <div
      className="rounded border p-4 text-sm"
      style={{ background: `color-mix(in srgb, ${color} 8%, var(--card))`, borderColor: color }}
    >
      <p className="font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        {alert.ingredientName}
        <span className="ml-1 font-normal" style={{ color: "var(--muted-foreground)" }}>
          (市場「{alert.itemName}」)
        </span>
        が
        {up ? "値上がり" : "値下がり"}
        <span className="font-mono" style={{ color }}>
          {" "}
          ({up ? "+" : ""}
          {Math.round(alert.changePercent)}%)
        </span>
      </p>
      {alert.affectedMenus.length === 0 ? (
        <p className="mt-1" style={{ color: "var(--muted-foreground)" }}>
          この食材を使うメニューは登録されていません。
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {alert.affectedMenus.map((m) => (
            <li key={m.menuId} className="flex flex-wrap items-center gap-2">
              <span style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>{m.menuName}</span>
              <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>
                原価率 {m.oldCostRate != null ? `${m.oldCostRate.toFixed(1)}%` : "-"} →{" "}
                {m.projectedCostRate != null ? `${m.projectedCostRate.toFixed(1)}%` : "-"}(試算)
              </span>
              {m.newlyOverTarget && <StatusBadge status="warn" label="目標超過見込み" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AlertsView({
  produceAlerts,
  livestockAlerts,
  hasProduceComparison,
  hasLivestockComparison,
}: {
  produceAlerts: MarketPriceAlert[];
  livestockAlerts: MarketPriceAlert[];
  hasProduceComparison: boolean;
  hasLivestockComparison: boolean;
}) {
  const allAlerts = [...produceAlerts, ...livestockAlerts];

  // 「この食材かもしれないが確信が持てない」候補は、以前はここに専用の通知として
  // 出していたが、今は上の「登録食材の追跡状況」一覧に食材ごとの状態(要確認)として
  // 統合されているため、ここでは変動の詳細(影響メニュー・原価率試算)だけを扱う。
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        価格変動アラート
      </h2>
      {allAlerts.length === 0 ? (
        <div className="rounded border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          {!hasProduceComparison && !hasLivestockComparison
            ? "まだ2期分の市場データが揃っていません(データ取得は月次・旬次の定期ジョブが行います)。"
            : "現在、閾値を超える価格変動は検知されていません。"}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {allAlerts.map((alert) => (
            <AlertCard key={`${alert.ingredientId}-${alert.itemName}`} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
