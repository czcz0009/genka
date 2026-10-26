// 旬報(野菜の卸売価格の値動きのまとめ)の下書きを作る(2026-10-26)。自動で投稿はしない。
//
// 使い方(リポジトリのフォルダで):
//   node --experimental-strip-types --env-file=.env.local scripts/shunpo/makeShunpo.ts [--force]
// - DBにある最新の旬と1つ前の旬を比べて、下書きを作る(DBは読むだけ)。
// - 保存先: 環境変数 SHUNPO_OUT_DIR(既定は <ホーム>/genka-demo/旬報)の下の「2026年10月上旬」等のフォルダ。
//   X投稿.txt(Xの下書き)、画像.png(1080×1350)、選び方.txt(選ばれた品目・外れた品目と理由)。
// - その旬のフォルダが既にあれば、何もしない(毎朝動かしても、新しい旬が入ったときだけ作る)。--force で作り直す。
// - 実行の結果は、保存先の「実行ログ.txt」に1行ずつ追記する。
// 毎朝の実行は、Windowsのタスクスケジューラから scripts/shunpo/run_shunpo.cmd を呼ぶ(HANDOFF参照)。
// 品目の選び方・文面は src/lib/marketPrices/shunpo.ts(テストあり)。
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { previousPeriod, type Period } from "../../src/lib/marketPrices/period.ts";
import {
  selectShunpoItems,
  buildXDraft,
  buildImageHtml,
  formatChange,
  formatYoy,
  xWeightedLength,
  periodLabel,
  type ShunpoRow,
} from "../../src/lib/marketPrices/shunpo.ts";

const force = process.argv.includes("--force");
const outRoot = process.env.SHUNPO_OUT_DIR ?? join(homedir(), "genka-demo", "旬報");
mkdirSync(outRoot, { recursive: true });
const logLine = (msg: string) => {
  const line = `${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} ${msg}`;
  console.log(line);
  appendFileSync(join(outRoot, "実行ログ.txt"), line + "\n");
};

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: latest, error: latestErr } = await supabase
    .from("market_price_observations")
    .select("period_year, period_month, period_third")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("period_third", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw latestErr;
  if (!latest) return logLine("野菜のデータがありません(何もしません)");
  const cur: Period = { year: latest.period_year, month: latest.period_month, third: latest.period_third as 1 | 2 | 3 };
  const prev = previousPeriod(cur);
  const folder = join(outRoot, `${cur.year}年${periodLabel(cur)}`);
  if (existsSync(join(folder, "X投稿.txt")) && !force) return logLine(`${cur.year}年${periodLabel(cur)}: 作成済みのため何もしません`);

  const rows = async (p: Period) => {
    const { data, error } = await supabase
      .from("market_price_observations")
      .select("item_code, item_name, price_per_kg, wholesale_quantity_ton, yoy_price_percent")
      .eq("period_year", p.year)
      .eq("period_month", p.month)
      .eq("period_third", p.third);
    if (error) throw error;
    return (data ?? []) as ShunpoRow[];
  };
  const [current, previous] = await Promise.all([rows(cur), rows(prev)]);
  if (previous.length === 0) return logLine(`${cur.year}年${periodLabel(cur)}: 前の旬(${periodLabel(prev)})のデータがないため作りません`);

  const sel = selectShunpoItems(current, previous);
  const draft = buildXDraft(sel, cur, prev);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "X投稿.txt"), draft + "\n");

  const item = (x: (typeof sel.up)[number]) =>
    `  ${x.itemName}  ${Math.round(x.previousPrice)}→${Math.round(x.currentPrice)}円/kg  ${formatChange(x.changePercent)}(四捨五入前 ${x.changePercent.toFixed(1)}%)  入荷量 ${x.quantityTon}トン  前年同旬比 ${formatYoy(x.yoyIndex) ?? "なし"}(${x.yoyIndex ?? "-"})`;
  writeFileSync(
    join(folder, "選び方.txt"),
    [
      `${cur.year}年${periodLabel(cur)}と${periodLabel(prev)}の比較(全国の主要卸売市場の卸売価格)`,
      `基準: 野菜だけ / 最新の旬の入荷量100トン以上 / 前の旬から±10%以上 / 値上がり・値下がり各3件まで(変動率の大きい順、同じなら入荷量の多い順)`,
      `Xの文字数(全角は2字分で数える): ${xWeightedLength(draft)} / 280`,
      "",
      "■ 値上がり",
      ...(sel.up.length ? sel.up.map(item) : ["  なし"]),
      "■ 値下がり",
      ...(sel.down.length ? sel.down.map(item) : ["  なし"]),
      "■ ±10%以上動いたが、外れた品目",
      ...(sel.excluded.length ? sel.excluded.map((x) => `  ${x.itemName}  ${x.changePercent.toFixed(1)}%  入荷量 ${x.quantityTon ?? "-"}トン  理由: ${x.reason}`) : ["  なし"]),
      "",
      "※前年同旬比は、農林水産省のCSVの「対前年同旬比価格(%)」の値(前年=100)。",
    ].join("\n") + "\n",
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(buildImageHtml(sel, cur, prev), { waitUntil: "load", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(folder, "画像.png") });
  } finally {
    await browser.close();
  }
  logLine(`${cur.year}年${periodLabel(cur)}: 下書きを作成(値上がり${sel.up.length}件・値下がり${sel.down.length}件) → ${folder}`);
}

main().catch((e) => {
  logLine(`失敗: ${String(e?.message ?? e).replace(/\s+/g, " ")}`);
  process.exit(1);
});
