import type { MarketDataStatus } from "@/lib/marketPrices/marketDataFreshness.ts";
import { Notice } from "@/components/Notice.tsx";

/**
 * アラート画面上部の「市場価格を何旬(何月)分まで取得済みか」(2026-10-23)。
 * 取得が遅れている(野菜は4旬以上、食肉は3か月以上)か、データが1件も無いときは、黄色の注意で出す。
 * 最新の1つ前の旬(月)が無いときは「比較できません」も出す(アラートが黙って止まるのを防ぐ)。
 * 判定は marketDataFreshness.ts(テストあり)。
 */
export function MarketDataStatusPanel({ status }: { status: MarketDataStatus }) {
  const lines = [status.produce, status.livestock].filter((c) => c != null);
  const body = status.noData ? (
    <p>市場価格をまだ取得していません。</p>
  ) : (
    <ul className="flex flex-col gap-1">
      {lines.map((c) => (
        <li key={c.text}>
          {c.text}
          {c.stale && <span className="ml-1 font-semibold">(取得が遅れています)</span>}
          {c.missingPreviousMessage && (
            <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
              {c.missingPreviousMessage}
            </span>
          )}
        </li>
      ))}
    </ul>
  );

  if (status.anyStale) {
    return (
      <Notice tone="warn" title="市場価格の取得が止まっている可能性があります">
        {body}
      </Notice>
    );
  }
  return (
    <div className="rounded border p-3 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
      {body}
    </div>
  );
}
