/**
 * 旬報(野菜の卸売価格の値動きのまとめ)の下書きを作る(2026-10-26)。
 *
 * 最新の旬と1つ前の旬を比べて、値上がり・値下がりの大きい品目を選び、Xの投稿の下書きと
 * 画像用のHTMLを作る。自動で投稿はしない(Mahiroが見てから手で投稿する)。
 * 原価レンズの宣伝・URLは入れない(店主に役立つ情報として出すため)。
 *
 * 品目の選び方(Mahiro確認済み):
 * - 野菜だけ(品目コードが「3」で始まるもの)。果物は外す
 * - 集計の行(「〜計」「その他の〜」「他の〜」「うち〜」)は外す
 * - 最新の旬の入荷量(卸売数量)が100トン未満の品目は外す(値が大きく振れ、実態を表さないため)
 * - 前の旬から±10%以上動いた品目(アプリの仕入れ値アラートと同じ基準)
 * - 値上がり・値下がりを、それぞれ最大3件
 * - 並び順: 四捨五入する前の変動率の絶対値が大きい順 → 同じなら最新の旬の入荷量が多い順 → それも同じなら品目コード順
 *
 * 前年同旬比は、農林水産省のCSVの「対前年同旬比価格(%)」の列(DBの yoy_price_percent)をそのまま使う
 * (DBの過去のデータから計算していない)。前年=100の指数。95〜105は「前年並み」と書く。
 * テストは shunpo.test.ts(10月上旬と9月下旬の実データ)。
 */
import type { Period } from "./period.ts";

export interface ShunpoRow {
  item_code: string;
  item_name: string;
  price_per_kg: number | null;
  wholesale_quantity_ton: number | null;
  /** 対前年同旬比価格(%)。前年=100 */
  yoy_price_percent: number | null;
}

export interface ShunpoItem {
  itemCode: string;
  itemName: string;
  previousPrice: number;
  currentPrice: number;
  /** 四捨五入する前の変動率(%) */
  changePercent: number;
  quantityTon: number;
  yoyIndex: number | null;
}

export type ExcludeReason = "野菜ではない" | "集計の行" | "前の旬の価格がない" | "最新の旬の価格がない" | "入荷量100トン未満" | "件数の上限(3件)";

export interface ShunpoSelection {
  up: ShunpoItem[];
  down: ShunpoItem[];
  /** ±10%以上動いたが選ばれなかった品目と、その理由 */
  excluded: { itemName: string; changePercent: number; quantityTon: number | null; reason: ExcludeReason }[];
}

export const SHUNPO_MIN_QUANTITY_TON = 100;
export const SHUNPO_MIN_CHANGE_PERCENT = 10;
export const SHUNPO_MAX_ITEMS = 3;

const THIRD = ["上旬", "中旬", "下旬"] as const;
export const periodLabel = (p: Period) => `${p.month}月${THIRD[p.third - 1]}`;

const isVegetable = (code: string) => code.startsWith("3");
const isAggregate = (name: string) => /計|その他|他の|うち/.test(name);

function byPriority(a: ShunpoItem, b: ShunpoItem): number {
  const d = Math.abs(b.changePercent) - Math.abs(a.changePercent);
  if (d !== 0) return d;
  const q = b.quantityTon - a.quantityTon;
  if (q !== 0) return q;
  return a.itemCode < b.itemCode ? -1 : a.itemCode > b.itemCode ? 1 : 0;
}

export function selectShunpoItems(current: ShunpoRow[], previous: ShunpoRow[]): ShunpoSelection {
  const prevByCode = new Map(previous.map((r) => [r.item_code, r]));
  const excluded: ShunpoSelection["excluded"] = [];
  const candidates: ShunpoItem[] = [];
  for (const c of current) {
    const p = prevByCode.get(c.item_code);
    if (!p || p.price_per_kg == null || p.price_per_kg === 0 || c.price_per_kg == null) continue; // 比べられない
    const changePercent = ((c.price_per_kg - p.price_per_kg) / p.price_per_kg) * 100;
    if (Math.abs(changePercent) < SHUNPO_MIN_CHANGE_PERCENT) continue;
    const base = { itemName: c.item_name, changePercent, quantityTon: c.wholesale_quantity_ton };
    if (!isVegetable(c.item_code)) { excluded.push({ ...base, reason: "野菜ではない" }); continue; }
    if (isAggregate(c.item_name)) { excluded.push({ ...base, reason: "集計の行" }); continue; }
    if (c.wholesale_quantity_ton == null || c.wholesale_quantity_ton < SHUNPO_MIN_QUANTITY_TON) {
      excluded.push({ ...base, reason: "入荷量100トン未満" });
      continue;
    }
    candidates.push({
      itemCode: c.item_code,
      itemName: c.item_name,
      previousPrice: p.price_per_kg,
      currentPrice: c.price_per_kg,
      changePercent,
      quantityTon: c.wholesale_quantity_ton,
      yoyIndex: c.yoy_price_percent,
    });
  }
  const pick = (list: ShunpoItem[]) => {
    const sorted = [...list].sort(byPriority);
    for (const x of sorted.slice(SHUNPO_MAX_ITEMS)) {
      excluded.push({ itemName: x.itemName, changePercent: x.changePercent, quantityTon: x.quantityTon, reason: "件数の上限(3件)" });
    }
    return sorted.slice(0, SHUNPO_MAX_ITEMS);
  };
  const up = pick(candidates.filter((x) => x.changePercent > 0));
  const down = pick(candidates.filter((x) => x.changePercent < 0));
  return { up, down, excluded };
}

/** 変動率の表示(+43% / −17%)。四捨五入は絶対値で行う */
export function formatChange(pct: number): string {
  const r = Math.round(Math.abs(pct));
  return `${pct > 0 ? "+" : "−"}${r}%`;
}

/** 前年同旬比の表示。95〜105は「前年並み」、それ以外は「約1.7倍」/「約0.8倍」 */
export function formatYoy(index: number | null): string | null {
  if (index == null) return null;
  if (index >= 95 && index <= 105) return "前年並み";
  return `約${(index / 100).toFixed(1)}倍`;
}

export const SOURCE_SHORT = "出典:農林水産省「青果物卸売市場調査」をもとに加工(国の保証なし)";
export const SOURCE_LONG =
  "出典: 農林水産省「青果物卸売市場調査(旬別結果)」をもとに加工して作成。国(農林水産省)が内容を保証するものではありません。";

/** 前年同旬比がこれ以上(前年=100)の品目を、最後の一言で取り上げる */
export const TIP_HIGH_YOY_INDEX = 130;

/** 前年同旬比が130以上の品目のうち、最も大きいもの(同じなら選ばれた順で先のもの)。なければnull */
function highestYoy(items: ShunpoItem[]): ShunpoItem | null {
  let best: ShunpoItem | null = null;
  for (const x of items) {
    if (x.yoyIndex == null || x.yoyIndex < TIP_HIGH_YOY_INDEX) continue;
    if (!best || x.yoyIndex > (best.yoyIndex ?? 0)) best = x;
  }
  return best;
}

/**
 * 最後の一言。決まった型から選ぶ(AIで文章を作らない)。上から順に、最初に当てはまったものを使う(Mahiro確認済み):
 *  1. 値上がりの品目に、前年同旬比130以上がある → その中で前年同旬比が最も大きい品目
 *     「Xは前年同時期の約N倍。Xを多く使うメニューは、仕入れ値の確認を。」
 *  2. 1が無く、値下がりの品目に、前年同旬比130以上がある → その中で最も大きい品目
 *     「Xは値下がりしましたが、前年同時期の約N倍です。」(値下がりでも、前年よりまだ高いことを伝える)
 *  3. 値上がりの品目がある → いちばん大きく上がった品目「Xを多く使うメニューは、仕入れ値の確認を。」
 *  4. 値下がりの品目だけがある →「値下がりした品目は、仕入れ値の見直しの参考に。」
 *  5. どちらも無い →「前の旬から10%以上動いた品目はありませんでした。」
 * 前年同旬比が同じ品目が並んだときは、選ばれた順(変動率の大きい順)で先のものを選ぶ。
 */
export function tipLine(sel: ShunpoSelection): string {
  const upHigh = highestYoy(sel.up);
  if (upHigh) return `${upHigh.itemName}は前年同時期の${formatYoy(upHigh.yoyIndex)}。${upHigh.itemName}を多く使うメニューは、仕入れ値の確認を。`;
  const downHigh = highestYoy(sel.down);
  if (downHigh) return `${downHigh.itemName}は値下がりしましたが、前年同時期の${formatYoy(downHigh.yoyIndex)}です。`;
  if (sel.up[0]) return `${sel.up[0].itemName}を多く使うメニューは、仕入れ値の確認を。`;
  if (sel.down[0]) return "値下がりした品目は、仕入れ値の見直しの参考に。";
  return "前の旬から10%以上動いた品目はありませんでした。";
}

/** Xの文字数の数え方(全角などは2、半角英数字・記号は1) */
export function xWeightedLength(text: string): number {
  return [...text].reduce((a, c) => a + (c.codePointAt(0)! < 0x1100 ? 1 : 2), 0);
}
export const X_LIMIT = 280;

export function buildXDraft(sel: ShunpoSelection, current: Period, previous: Period): string {
  const lines = [`【野菜の卸売価格 ${periodLabel(current)}】`, `前の旬(${periodLabel(previous)})と比べて`];
  for (const x of sel.up) lines.push(`↑${x.itemName} ${formatChange(x.changePercent)}`);
  for (const x of sel.down) lines.push(`↓${x.itemName} ${formatChange(x.changePercent)}`);
  const tip = tipLine(sel);
  const withTip = [...lines, tip, SOURCE_SHORT].join("\n");
  // 上限を超えるときは、最後の一言を省く(品目と出典は必ず残す)
  return xWeightedLength(withTip) <= X_LIMIT ? withTip : [...lines, SOURCE_SHORT].join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 画像(1080×1350)のHTML。表示は画像にしてから使う(scripts/shunpo/makeShunpo.ts) */
export function buildImageHtml(sel: ShunpoSelection, current: Period, previous: Period): string {
  const head = `<tr><th>品目</th><th>${periodLabel(previous)}→${periodLabel(current)}</th><th>前旬比</th><th>前年同旬比</th></tr>`;
  const row = (x: ShunpoItem) =>
    `<tr><td class="n">${esc(x.itemName)}</td><td>${Math.round(x.previousPrice)}<span class="u">→</span><b>${Math.round(x.currentPrice)}</b></td>` +
    `<td class="${x.changePercent > 0 ? "up" : "dn"}">${formatChange(x.changePercent)}</td><td class="y">${formatYoy(x.yoyIndex) ?? "—"}</td></tr>`;
  const section = (title: string, cls: string, items: ShunpoItem[]) =>
    items.length ? `<div class="sec ${cls}">${title}</div><table>${head}${items.map(row).join("")}</table>` : "";
  const none = !sel.up.length && !sel.down.length ? `<p class="none">前の旬から10%以上動いた品目はありませんでした。</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&display=block');
*{margin:0;box-sizing:border-box}body{width:1080px;height:1350px;font-family:'Noto Sans JP','Yu Gothic',sans-serif;background:#f5f7fa;color:#0f1d33;padding:70px 70px 50px;position:relative}
h1{font-size:62px;font-weight:900}h2{font-size:30px;font-weight:500;color:#475569;margin-top:10px}
.sec{margin-top:44px;font-size:34px;font-weight:900}.sec.up{color:#c0262d}.sec.dn{color:#2563a8}
table{width:100%;border-collapse:collapse;margin-top:14px;background:#fff;border-radius:16px;overflow:hidden}
th{font-size:24px;color:#64748b;font-weight:500;text-align:right;padding:16px 24px;border-bottom:1px solid #e2e8f0}th:first-child{text-align:left}
td{font-size:38px;padding:20px 24px;text-align:right;border-bottom:1px solid #eef2f6}td.n{text-align:left;font-weight:700}
.u{color:#94a3b8;margin:0 8px}td.up{color:#c0262d;font-weight:900}td.dn{color:#2563a8;font-weight:900}td.y{color:#475569;font-size:32px}
.none{margin-top:60px;font-size:36px;color:#475569}
.note{position:absolute;left:70px;right:70px;bottom:50px;font-size:22px;color:#64748b;line-height:1.6}
</style></head><body>
<h1>野菜の卸売価格 ${periodLabel(current)}</h1><h2>前の旬(${periodLabel(previous)})との比較 / 全国の主要卸売市場 / 円/kg</h2>
${section("値上がり", "up", sel.up)}${section("値下がり", "dn", sel.down)}${none}
<div class="note">対象: 野菜のうち、${periodLabel(current)}の入荷量が${SHUNPO_MIN_QUANTITY_TON}トン以上で、前の旬から${SHUNPO_MIN_CHANGE_PERCENT}%以上動いた品目(値上がり・値下がり各${SHUNPO_MAX_ITEMS}件まで)。卸売価格であり、小売価格・各店の仕入れ値とは異なります。<br>${SOURCE_LONG}</div>
</body></html>`;
}
