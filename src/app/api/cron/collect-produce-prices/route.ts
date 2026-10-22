import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import type { Period } from "@/lib/marketPrices/period";
import { fetchSyuyoCsv } from "@/lib/marketPrices/fetchSyuyoCsv";
import { parseSyuyoCsv } from "@/lib/marketPrices/parseSyuyoCsv";
import { collectProducePrices } from "@/lib/marketPrices/produceCollection";
import { buildProduceObservationRows } from "@/lib/marketPrices/observationRows";

/** 1回の実行で最大4旬・アクセスの間12秒。80秒を過ぎたら新しいアクセスを始めない(produceCollection.ts) */
export const maxDuration = 120;

/**
 * 農水省「青果物卸売市場調査(旬別結果)」の定期取得ジョブ。
 * 月3回(日本時間 9・19・29日の3時)、Vercel Cronから呼ばれる。
 *
 * 「DBにある最新の旬の次」から「終わっている直近の旬」までを古い順に試す(1回4旬まで。
 * 未公表ならその回はやめ、次の実行で続きから試す)。どの旬を試すか・どこでやめるか・
 * 応答コードの決め方は src/lib/marketPrices/produceCollection.ts(テストあり)。
 * 応答: DBの読み書きの失敗(鍵・権限・接続)は500。未公表・農水省との通信エラーは200(中身に結果)。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "service role が未設定です" }, { status: 500 });
  }

  const startedAt = Date.now();
  const result = await collectProducePrices(
    {
      readLatestStored: async () => {
        const { data, error } = await supabase
          .from("market_price_observations")
          .select("period_year, period_month, period_third")
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .order("period_third", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return { ok: false, detail: error.message };
        return {
          ok: true,
          latest: data ? { year: data.period_year, month: data.period_month, third: data.period_third as Period["third"] } : null,
        };
      },
      fetchCsv: (period) => fetchSyuyoCsv(period),
      saveCsv: async (period, bytes) => {
        let rows;
        try {
          // 取得日には、今回農水省から取得して保存した日時を入れる(上書きのときも更新する)
          rows = buildProduceObservationRows(period, parseSyuyoCsv(bytes).items, new Date().toISOString());
        } catch (e) {
          return { ok: false, kind: "parse", detail: e instanceof Error ? e.message : String(e) };
        }
        const { error } = await supabase
          .from("market_price_observations")
          .upsert(rows, { onConflict: "item_code,period_year,period_month,period_third" });
        if (error) return { ok: false, kind: "db", detail: error.message };
        return { ok: true, itemCount: rows.length };
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      elapsedMs: () => Date.now() - startedAt,
    },
    new Date(),
  );

  return NextResponse.json(
    {
      status: result.httpStatus === 200 ? "done" : "error",
      error: result.error,
      results: result.results,
      nextFrom: result.nextFrom,
      stoppedBecause: result.stoppedBecause,
    },
    { status: result.httpStatus },
  );
}
