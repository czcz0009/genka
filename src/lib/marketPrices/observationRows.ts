/**
 * 市場価格をDBに書き込む行の組み立て(野菜: market_price_observations、食肉: livestock_price_observations)。
 * 定期取得(src/app/api/cron/collect-*-prices/route.ts)と、穴埋めのスクリプト(scripts/backfill/)の両方で使う。
 *
 * 取得日(fetched_at)には「最後に農水省から取得して保存した日時」を入れる(2026-10-22)。
 * 以前は渡しておらず、DBの既定値(行を新しく入れたときだけ now())に任せていたため、
 * 上書き(upsert)したときに取得日が最初に入れた日のまま残っていた。
 * テストは observationRows.test.ts。
 */
import type { Period } from "./period.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import type { ChikusanRow } from "./livestock/parseChikusanPdf.ts";
import { CHIKUSAN_COLUMNS } from "./livestock/chikusanColumns.ts";
import { parseMonthlyRowLabel } from "./livestock/monthlyComparison.ts";

export function buildProduceObservationRows(period: Period, items: SyuyoItem[], fetchedAt: string) {
  return items
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
      fetched_at: fetchedAt,
    }));
}

export function buildLivestockObservationRows(pdfRows: ChikusanRow[], fetchedAt: string) {
  const priceCodes = CHIKUSAN_COLUMNS.filter((c) => c.itemCode);
  return pdfRows
    .filter((r) => r.kind === "monthly")
    .flatMap((row) => {
      const period = parseMonthlyRowLabel(row.rowLabel);
      if (!period) return [];
      return priceCodes.map((c) => ({
        item_code: c.itemCode as string,
        item_name: c.label,
        period_year: period.year,
        period_month: period.month,
        price_per_kg: row.prices[c.itemCode!] ?? null,
        fetched_at: fetchedAt,
      }));
    });
}
