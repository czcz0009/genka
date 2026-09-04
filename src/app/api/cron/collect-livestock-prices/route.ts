import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { fetchChikusanListing, fetchChikusanPdf } from "@/lib/marketPrices/livestock/fetchChikusanReport";
import { parseChikusanPdf } from "@/lib/marketPrices/livestock/parseChikusanPdf";
import { CHIKUSAN_COLUMNS } from "@/lib/marketPrices/livestock/chikusanColumns";
import { parseMonthlyRowLabel } from "@/lib/marketPrices/livestock/monthlyComparison";

/**
 * 農水省「畜産物卸売価格の推移(月報告)」の定期取得ジョブ。月1回、Vercel Cronから呼ばれる想定。
 *
 * 一覧ページを都度確認してタイトルに「月報告」を含むリンクを取得し(ファイル名は
 * 日付から機械的に組み立てられないため)、PDF内の月次サマリー行を全てupsertする。
 * PDFには複数月分の履歴が入っているため、初回実行時にまとめて数ヶ月分の履歴が入り、
 * 以降は最新月だけが実質的に増えていく(同じ月を再upsertしても値は変わらない)。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "service role が未設定です" }, { status: 500 });
  }

  const listing = await fetchChikusanListing();
  if (listing.status !== "ok") {
    return NextResponse.json({ step: "listing", status: listing.status });
  }

  const pdf = await fetchChikusanPdf(listing.link.url);
  if (pdf.status !== "ok") {
    return NextResponse.json({ step: "pdf", status: pdf.status, detail: pdf.detail });
  }

  const parsed = await parseChikusanPdf(pdf.bytes);
  if (parsed.status !== "ok") {
    return NextResponse.json({ step: "parse", status: parsed.status, detail: parsed.detail });
  }

  const monthlyRows = parsed.rows.filter((r) => r.kind === "monthly");
  const priceCodes = CHIKUSAN_COLUMNS.filter((c) => c.itemCode);

  const observationRows = monthlyRows.flatMap((row) => {
    const period = parseMonthlyRowLabel(row.rowLabel);
    if (!period) return [];
    return priceCodes.map((c) => ({
      item_code: c.itemCode as string,
      item_name: c.label,
      period_year: period.year,
      period_month: period.month,
      price_per_kg: row.prices[c.itemCode!] ?? null,
    }));
  });

  const { error: upsertError } = await supabase
    .from("livestock_price_observations")
    .upsert(observationRows, { onConflict: "item_code,period_year,period_month" });

  return NextResponse.json({
    status: upsertError ? "error" : "saved",
    detail: upsertError?.message,
    sourceUrl: listing.link.url,
    monthsFound: monthlyRows.length,
    rowCount: observationRows.length,
  });
}
