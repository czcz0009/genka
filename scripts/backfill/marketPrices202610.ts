/**
 * 2026-10-22: 本番の管理者用の鍵が無効で、市場価格の定期取得が9月から一度も成功していなかった件の、
 * 1回きりの穴埋め(docs/HANDOFF.md「本番の管理者用の鍵が無効で…」)。
 *
 * 2段階で使う(農水省へのアクセスを増やさずに、書き込む前に正確な行数を確認するため):
 *   1. fetch: 農水省の公開ファイルを取得して手元に保存し、旬・月ごとの行数を表示する(DBには書かない)
 *      node --env-file=.env.local --experimental-strip-types scripts/backfill/marketPrices202610.ts fetch <保存先フォルダ>
 *   2. write: 保存したファイルだけを読み、DBに書き込む(農水省へは再アクセスしない)
 *      node --env-file=.env.local --experimental-strip-types scripts/backfill/marketPrices202610.ts write <保存先フォルダ>
 *
 * 守っていること:
 * - 取得先は www.maff.go.jp の公開ファイルだけ。1ファイルにつき1回だけアクセスし、失敗しても繰り返さない。
 *   アクセスの間隔は12秒。名乗り(User-Agent)は定期取得と同じもの(fetchSyuyoCsv / fetchChikusanReport を使う)。
 * - すでに保存先にあるファイルは取得しない(fetchをやり直しても再アクセスしない)。DBにすでにある旬も取得しない。
 * - 書き込みは定期取得(src/app/api/cron/collect-*-prices/route.ts)と同じ行の形(observationRows.ts)・同じ一意キーで
 *   upsertする(何度実行しても二重にならない)。取得日(fetched_at)には、書き込みを実行した日時を入れる(2026-10-22に追加)。読み取りも定期取得と同じ部品を使う(偽のデータは作らない)。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildSyuyoCsvUrl, formatPeriodLabel, type Period } from "../../src/lib/marketPrices/period.ts";
import { fetchSyuyoCsv } from "../../src/lib/marketPrices/fetchSyuyoCsv.ts";
import { parseSyuyoCsv } from "../../src/lib/marketPrices/parseSyuyoCsv.ts";
import { fetchChikusanListing, fetchChikusanPdf } from "../../src/lib/marketPrices/livestock/fetchChikusanReport.ts";
import { parseChikusanPdf } from "../../src/lib/marketPrices/livestock/parseChikusanPdf.ts";
import { buildLivestockObservationRows, buildProduceObservationRows } from "../../src/lib/marketPrices/observationRows.ts";

/** 取る旬(アラートに直結する9月下旬・10月上旬を先に取る) */
const PRODUCE_PERIODS: Period[] = [
  { year: 2026, month: 9, third: 3 },
  { year: 2026, month: 10, third: 1 },
  { year: 2026, month: 9, third: 1 },
  { year: 2026, month: 9, third: 2 },
];
/** 9月下旬・10月上旬は必須(最新と1つ前の旬になる) */
const REQUIRED = new Set(["2026-9-3", "2026-10-1"]);
const WAIT_MS = 12_000;
const LIVESTOCK_FILE = "livestock_monthly_report.pdf";
const LIVESTOCK_META = "livestock_monthly_report.json";

const [mode, cacheDir] = process.argv.slice(2);
if ((mode !== "fetch" && mode !== "write") || !cacheDir) {
  console.error("使い方: marketPrices202610.ts fetch|write <保存先フォルダ>");
  process.exit(1);
}
mkdirSync(cacheDir, { recursive: true });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const key = (p: Period) => `${p.year}-${p.month}-${p.third}`;
const produceFile = (p: Period) => join(cacheDir, buildSyuyoCsvUrl(p).split("/").pop()!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 書き込む行の形は定期取得と同じ部品(observationRows.ts)。取得日には、書き込みを実行した日時を入れる
const FETCHED_AT = new Date().toISOString();

function produceRows(p: Period, bytes: ArrayBuffer) {
  const parsed = parseSyuyoCsv(bytes);
  const rows = buildProduceObservationRows(p, parsed.items, FETCHED_AT);
  return { rows, breakdownCount: parsed.items.length - rows.length };
}

async function livestockRows(bytes: Uint8Array) {
  const parsed = await parseChikusanPdf(bytes);
  if (parsed.status !== "ok") throw new Error(`PDFの読み取りに失敗: ${parsed.status} ${"detail" in parsed ? parsed.detail : ""}`);
  return buildLivestockObservationRows(parsed.rows, FETCHED_AT);
}

async function existingProduceCount(p: Period): Promise<number> {
  const { count, error } = await supabase
    .from("market_price_observations")
    .select("id", { count: "exact", head: true })
    .eq("period_year", p.year)
    .eq("period_month", p.month)
    .eq("period_third", p.third);
  if (error) throw new Error(`DBの確認に失敗: ${error.message}`);
  return count ?? 0;
}

if (mode === "fetch") {
  let requests = 0;
  const wait = async () => {
    if (requests > 0) await sleep(WAIT_MS);
  };
  // 比較用: 既存の8月下旬の品目
  const { data: aug } = await supabase
    .from("market_price_observations")
    .select("item_code")
    .eq("period_year", 2026)
    .eq("period_month", 8)
    .eq("period_third", 3);
  const augCodes = new Set((aug ?? []).map((r) => r.item_code));
  console.log(`比較用: 既存の2026年8月下旬 ${augCodes.size}件`);

  for (const p of PRODUCE_PERIODS) {
    const label = formatPeriodLabel(p);
    const file = produceFile(p);
    const existing = await existingProduceCount(p);
    if (existing > 0) {
      console.log(`${label}: DBにすでに${existing}件あるため取得しない`);
      continue;
    }
    if (!existsSync(file)) {
      await wait();
      requests++;
      const result = await fetchSyuyoCsv(p); // 1回だけ。失敗しても繰り返さない
      if (result.status !== "ok") {
        console.log(`${label}: 取得できず(${result.status === "not_published" ? `未公表 HTTP ${result.httpStatus}` : result.detail})${REQUIRED.has(key(p)) ? " ★必須の旬" : ""}`);
        continue;
      }
      writeFileSync(file, Buffer.from(result.bytes));
    }
    const buf = readFileSync(file);
    const { rows, breakdownCount } = produceRows(p, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const codes = new Set(rows.map((r) => r.item_code));
    const added = [...codes].filter((c) => !augCodes.has(c));
    const missing = [...augCodes].filter((c) => !codes.has(c));
    const nullPrice = rows.filter((r) => r.price_per_kg == null).length;
    const name = (c: string) => rows.find((r) => r.item_code === c)?.item_name ?? c;
    console.log(
      `${label}: 書き込む行 ${rows.length}件(内訳行 ${breakdownCount}件は除外、価格なし ${nullPrice}件)` +
        ` / 8月下旬にない品目 ${added.length}件${added.length ? `(${added.map(name).join("、")})` : ""}` +
        ` / 8月下旬にあってこの旬にない品目 ${missing.length}件${missing.length ? `(${missing.join("、")})` : ""}`,
    );
  }

  // 食肉: 一覧ページ(1回)→ 月報告PDF(1回)
  const pdfFile = join(cacheDir, LIVESTOCK_FILE);
  if (!existsSync(pdfFile)) {
    await wait();
    requests++;
    const listing = await fetchChikusanListing();
    if (listing.status !== "ok") {
      console.log(`食肉: 一覧ページの取得に失敗(${listing.status})`);
    } else {
      await sleep(WAIT_MS);
      requests++;
      const pdf = await fetchChikusanPdf(listing.link.url);
      if (pdf.status !== "ok") {
        console.log(`食肉: PDFの取得に失敗(${pdf.detail})`);
      } else {
        writeFileSync(pdfFile, Buffer.from(pdf.bytes));
        writeFileSync(join(cacheDir, LIVESTOCK_META), JSON.stringify(listing.link, null, 2));
      }
    }
  }
  if (existsSync(pdfFile)) {
    const meta = JSON.parse(readFileSync(join(cacheDir, LIVESTOCK_META), "utf8"));
    const rows = await livestockRows(new Uint8Array(readFileSync(pdfFile)));
    const { data: existing } = await supabase.from("livestock_price_observations").select("period_year, period_month, item_code, price_per_kg");
    const months = [...new Set(rows.map((r) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`))].sort();
    console.log(`食肉: 「${meta.linkText}」 ${meta.url}`);
    for (const m of months) {
      const mRows = rows.filter((r) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}` === m);
      const ex = (existing ?? []).filter((e) => `${e.period_year}-${String(e.period_month).padStart(2, "0")}` === m);
      const changed = mRows.filter((r) => {
        const e = ex.find((x) => x.item_code === r.item_code);
        return e && Number(e.price_per_kg) !== Number(r.price_per_kg);
      }).length;
      console.log(
        `  ${m}: ${mRows.length}行(価格なし ${mRows.filter((r) => r.price_per_kg == null).length}件) / DBに既存 ${ex.length}件` +
          `${ex.length ? `(値が変わる行 ${changed}件)` : "(新しく入る)"}`,
      );
    }
  }
  console.log(`農水省へのアクセス: 今回 ${requests}回(保存済みのファイルは再取得しない)`);
}

if (mode === "write") {
  for (const p of PRODUCE_PERIODS) {
    const file = produceFile(p);
    if (!existsSync(file)) {
      console.log(`${formatPeriodLabel(p)}: 保存したファイルがないため書き込まない`);
      continue;
    }
    const buf = readFileSync(file);
    const { rows } = produceRows(p, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const { error } = await supabase
      .from("market_price_observations")
      .upsert(rows, { onConflict: "item_code,period_year,period_month,period_third" });
    console.log(`${formatPeriodLabel(p)}: ${error ? `書き込み失敗 ${error.message}` : `${rows.length}行を書き込み`}`);
  }
  const pdfFile = join(cacheDir, LIVESTOCK_FILE);
  if (existsSync(pdfFile)) {
    const rows = await livestockRows(new Uint8Array(readFileSync(pdfFile)));
    const { error } = await supabase
      .from("livestock_price_observations")
      .upsert(rows, { onConflict: "item_code,period_year,period_month" });
    console.log(`食肉: ${error ? `書き込み失敗 ${error.message}` : `${rows.length}行を書き込み(既存の月は同じキーで上書き)`}`);
  } else {
    console.log("食肉: 保存したファイルがないため書き込まない");
  }
}
