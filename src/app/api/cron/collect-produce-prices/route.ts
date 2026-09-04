import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { periodForDate, previousPeriod, formatPeriodLabel, type Period } from "@/lib/marketPrices/period";
import { fetchSyuyoCsv } from "@/lib/marketPrices/fetchSyuyoCsv";
import { parseSyuyoCsv } from "@/lib/marketPrices/parseSyuyoCsv";

/**
 * 農水省「青果物卸売市場調査(旬別結果)」の定期取得ジョブ。
 * 月3回(上旬・中旬・下旬それぞれの公表後)、Vercel Cronから呼ばれる想定。
 *
 * 「今日がどの旬に属すか」から、直近2つの候補(1つ前の旬・今の旬)だけを試す。
 * 旬が終わってすぐは未公表(403)のことが多いので、次回のcron実行時に
 * 再度同じ候補を試すことで自然にリトライされる(状態を持たない設計)。
 * 既に保存済みの旬は再取得しない(サーバーへの不要なアクセスを避ける)。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "service role が未設定です" }, { status: 500 });
  }

  const todayThird = periodForDate(new Date());
  const candidates: Period[] = [previousPeriod(todayThird), todayThird];

  const results = [];
  for (const period of candidates) {
    const { count, error: countError } = await supabase
      .from("market_price_observations")
      .select("id", { count: "exact", head: true })
      .eq("period_year", period.year)
      .eq("period_month", period.month)
      .eq("period_third", period.third);

    if (countError) {
      results.push({ period: formatPeriodLabel(period), status: "error", detail: countError.message });
      continue;
    }
    if ((count ?? 0) > 0) {
      results.push({ period: formatPeriodLabel(period), status: "already_stored" });
      continue;
    }

    const fetchResult = await fetchSyuyoCsv(period);
    if (fetchResult.status !== "ok") {
      results.push({ period: formatPeriodLabel(period), status: fetchResult.status });
      continue;
    }

    const parsed = parseSyuyoCsv(fetchResult.bytes);
    const rows = parsed.items
      .filter((i) => !i.isBreakdownRow)
      .map((i) => ({
        item_code: i.itemCode,
        item_name: i.itemName,
        period_year: period.year,
        period_month: period.month,
        period_third: period.third,
        wholesale_quantity_ton: i.wholesaleQuantityTon,
        wholesale_value_thousand_yen: i.wholesaleValueThousandYen,
        price_per_kg: i.pricePerKg,
        yoy_quantity_percent: i.yoyQuantityPercent,
        yoy_price_percent: i.yoyPricePercent,
        prev_third_quantity_percent: i.prevThirdQuantityPercent,
        prev_third_price_percent: i.prevThirdPricePercent,
      }));

    const { error: upsertError } = await supabase
      .from("market_price_observations")
      .upsert(rows, { onConflict: "item_code,period_year,period_month,period_third" });

    results.push({
      period: formatPeriodLabel(period),
      status: upsertError ? "error" : "saved",
      detail: upsertError?.message,
      itemCount: rows.length,
    });
  }

  return NextResponse.json({ results });
}
