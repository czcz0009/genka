/**
 * 農水省「青果物卸売市場調査(旬別結果)」CSVの取得。
 *
 * 実際にアクセスして確認した挙動:
 * - www.maff.go.jp ドメインは robots.txt が存在せず(=クロール制限の明示なし)、
 *   通常のHTTPリクエストで取得できる(seisen.maff.go.jp の検索システムとは別サブドメインで、
 *   そちらは robots.txt で全面禁止されているため対象外にしている)。
 * - 対象の旬がまだ公表されていない場合、404ではなく403が返る
 *   (レスポンス本体は通常の「ページが見つかりません」エラーページ)。
 *   よって404・403のどちらも「未公表」として扱い、エラーで落とさずスキップする。
 * - 月3回(上旬・中旬・下旬それぞれの公表後)呼び出す想定。短時間の連続アクセスはしない
 *   (呼び出し側のスケジューラ側で頻度を制御する)。
 */
import type { Period } from "./period.ts";
import { buildSyuyoCsvUrl } from "./period.ts";

export type FetchSyuyoResult =
  | { status: "ok"; bytes: ArrayBuffer }
  | { status: "not_published"; httpStatus: number }
  | { status: "error"; detail: string };

/** HTTPステータスから「未公表として扱ってよいか」を判定する(単体テスト可能な純粋関数) */
export function isNotPublishedStatus(httpStatus: number): boolean {
  return httpStatus === 404 || httpStatus === 403;
}

// 政府の統計データを機械的に取得するバッチ処理であることを名乗る、正直なUser-Agent。
// ブラウザを装って検知を回避するような偽装はしない。
const USER_AGENT = "GenkasanMVP-MarketPriceFetcher/1.0 (agricultural wholesale price batch fetch)";

export async function fetchSyuyoCsv(period: Period): Promise<FetchSyuyoResult> {
  const url = buildSyuyoCsvUrl(period);
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }

  if (isNotPublishedStatus(response.status)) {
    return { status: "not_published", httpStatus: response.status };
  }
  if (!response.ok) {
    return { status: "error", detail: `HTTP ${response.status}` };
  }

  const bytes = await response.arrayBuffer();
  return { status: "ok", bytes };
}
