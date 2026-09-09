import type { MarketPriceAlert } from "@/lib/marketPrices/generateAlerts";
import type { IngredientItemMatch } from "@/lib/marketPrices/matchIngredientToItem";

function AlertCard({ alert }: { alert: MarketPriceAlert }) {
  const up = alert.direction === "up";
  return (
    <div
      className={`rounded-lg border p-4 text-sm ${
        up
          ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10"
          : "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/10"
      }`}
    >
      <p className="font-semibold">
        {alert.ingredientName}
        <span className="ml-1 font-normal text-black/50 dark:text-white/50">(市場「{alert.itemName}」)</span>が
        {up ? "値上がり" : "値下がり"}
        <span className={up ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}>
          {" "}
          ({up ? "+" : ""}
          {Math.round(alert.changePercent)}%)
        </span>
      </p>
      {alert.affectedMenus.length === 0 ? (
        <p className="mt-1 text-black/50 dark:text-white/50">この食材を使うメニューは登録されていません。</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {alert.affectedMenus.map((m) => (
            <li key={m.menuId} className="flex items-center gap-2">
              <span>{m.menuName}</span>
              <span className="text-black/50 dark:text-white/50">
                原価率 {m.oldCostRate != null ? `${m.oldCostRate.toFixed(1)}%` : "-"} →{" "}
                {m.projectedCostRate != null ? `${m.projectedCostRate.toFixed(1)}%` : "-"}(試算)
              </span>
              {m.newlyOverTarget && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  目標超過見込み
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AlertsView({
  produceAlerts,
  produceNeedsReview,
  livestockAlerts,
  hasProduceComparison,
  hasLivestockComparison,
}: {
  produceAlerts: MarketPriceAlert[];
  produceNeedsReview: IngredientItemMatch[];
  livestockAlerts: MarketPriceAlert[];
  hasProduceComparison: boolean;
  hasLivestockComparison: boolean;
}) {
  const allAlerts = [...produceAlerts, ...livestockAlerts];

  return (
    <div className="mt-8 flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold">価格変動アラート</h2>
        {allAlerts.length === 0 ? (
          <div className="rounded-lg border border-black/10 p-4 text-sm text-black/50 dark:border-white/10 dark:text-white/50">
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

      {produceNeedsReview.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-medium">
            この食材かもしれないと思われますが、判定に自信が持てず通知していません({produceNeedsReview.length}件)
          </p>
          <p className="mt-1 text-xs opacity-80">
            国が公表している市場価格の品目名と、食材名の綴りが十分に一致しなかったものです。関係なければ無視して構いません。
          </p>
          <ul className="mt-2 space-y-0.5">
            {produceNeedsReview.map((m) => (
              <li key={m.ingredientId}>
                {m.ingredientName} ≈ 「{m.itemName}」の可能性
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
