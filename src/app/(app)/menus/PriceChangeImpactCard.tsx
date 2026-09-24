import type { PriceChangeImpactResult } from "@/lib/priceChangeImpact.ts";
import { HelpButton } from "@/components/HelpButton.tsx";

function formatYen(n: number): string {
  const rounded = Math.round(n);
  return rounded < 0 ? `-¥${Math.abs(rounded).toLocaleString()}` : `¥${rounded.toLocaleString()}`;
}

/**
 * 直近の売価変更の成果(過去の値付け判断の追跡)。
 * 変更前の販売実績が無くまだ比較できない場合(result===null)と、比較できた
 * 場合の両方をこのコンポーネントで扱う。呼び出し側(menus/[id]/page.tsx)は
 * 「売価変更が1回でも記録されている時だけ」このコンポーネントを描画する。
 */
export function PriceChangeImpactCard({
  oldPrice,
  newPrice,
  result,
}: {
  oldPrice: number;
  newPrice: number;
  result: PriceChangeImpactResult | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          この価格変更の成果
        </p>
        <HelpButton title="この価格変更の成果とは">
          <p>
            直近の売価変更(¥{oldPrice.toLocaleString()} → ¥{newPrice.toLocaleString()})の前後で、実際の利益がどう変わったかを比較したものです。
          </p>
          <p className="mt-3">
            変更前の直近数ヶ月(販売数量の記録がある月)の「1食あたり利益」を基準にし、変更後の各月の実際の販売数量に基準との差を掛けて、累計の改善額を出しています。
          </p>
          <p className="mt-3">
            同じ客数でも単価が変わったことでどれだけ利益が変わったかを見るもので、価格変更が客数自体に与えた影響までは分離できません。
          </p>
        </HelpButton>
      </div>

      {result == null ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          売価を¥{oldPrice.toLocaleString()}から¥{newPrice.toLocaleString()}に変更した記録がありますが、変更前の販売実績の記録がまだ無いため、効果を比較できません。
        </p>
      ) : (
        <>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            ¥{oldPrice.toLocaleString()} → ¥{newPrice.toLocaleString()}(変更前
            {result.baselineMonthCount}ヶ月の実績をもとに、1食あたり利益{formatYen(result.baselineProfitPerUnit)}を基準にしています)
          </p>
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              累計の利益改善額
            </div>
            <div
              className="mt-1 font-mono text-3xl font-bold leading-none"
              style={{ color: result.cumulativeImprovement >= 0 ? "var(--status-ok)" : "var(--status-danger)" }}
            >
              {formatYen(result.cumulativeImprovement)}
            </div>
          </div>
          {result.monthlyBreakdown.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.monthlyBreakdown.map((m) => (
                <li key={m.month} className="flex items-center justify-between text-sm" style={{ color: "var(--foreground)" }}>
                  <span>
                    {m.month}({m.quantitySold}食)
                  </span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: m.improvement >= 0 ? "var(--status-ok)" : "var(--status-danger)" }}
                  >
                    {formatYen(m.improvement)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
