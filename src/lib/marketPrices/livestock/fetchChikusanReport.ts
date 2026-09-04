/**
 * 農水省「畜産物卸売価格の推移」一覧ページから、最新の月報告PDFのURLを見つけて
 * 取得する。
 *
 * 実際に確認した挙動:
 * - 一覧ページには複数のPDF(Monthly食肉鶏卵速報・和牛肉の需給動向・月予測・
 *   枝肉卸売価格の推移・月報告、など)が並んでおり、ファイル名は index-{連番}.pdf
 *   で日付から機械的に組み立てられない。実データの表(日別)が入っているのは
 *   タイトルに「月報告」を含むリンクだけで、他は別内容(グラフ画像や別調査)。
 *   そのため、都度一覧ページを見てタイトルで該当リンクを探す。
 * - www.maff.go.jp は robots.txt が存在せず、通常のHTTPリクエストで取得できる。
 */
import * as cheerio from "cheerio";

const LISTING_URL = "https://www.maff.go.jp/j/chikusan/shokuniku/lin/";
const TARGET_LINK_TEXT_PATTERN = /月報告/;

// 政府の統計データを機械的に取得するバッチ処理であることを名乗る、正直なUser-Agent。
// ブラウザを装って検知を回避するような偽装はしない(①の青果物データ取得と同じ方針)。
const USER_AGENT = "GenkasanMVP-MarketPriceFetcher/1.0 (livestock wholesale price batch fetch)";

export interface ChikusanReportLink {
  url: string;
  linkText: string;
}

/** 一覧ページのHTMLから「月報告」を含むリンクを探す(ネットワークに依存しない純粋関数、テスト可能) */
export function findChikusanReportLink(html: string): ChikusanReportLink | null {
  const $ = cheerio.load(html);
  let found: ChikusanReportLink | null = null;

  $("a").each((_, el) => {
    if (found) return;
    const text = $(el).text().trim();
    if (!TARGET_LINK_TEXT_PATTERN.test(text)) return;
    const href = $(el).attr("href");
    if (!href) return;
    found = { url: new URL(href, LISTING_URL).toString(), linkText: text };
  });

  return found;
}

export type FetchChikusanListingResult =
  | { status: "ok"; link: ChikusanReportLink }
  | { status: "not_found" }
  | { status: "error"; detail: string };

export async function fetchChikusanListing(): Promise<FetchChikusanListingResult> {
  let response: Response;
  try {
    response = await fetch(LISTING_URL, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!response.ok) {
    return { status: "error", detail: `HTTP ${response.status}` };
  }
  const html = await response.text();
  const link = findChikusanReportLink(html);
  return link ? { status: "ok", link } : { status: "not_found" };
}

export type FetchChikusanPdfResult =
  | { status: "ok"; bytes: ArrayBuffer }
  | { status: "error"; detail: string };

export async function fetchChikusanPdf(url: string): Promise<FetchChikusanPdfResult> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!response.ok) {
    return { status: "error", detail: `HTTP ${response.status}` };
  }
  return { status: "ok", bytes: await response.arrayBuffer() };
}
