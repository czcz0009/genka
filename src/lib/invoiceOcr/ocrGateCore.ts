/**
 * 読み取りの回数の関数(マイグレーション0029)を呼ぶところの本体(2026-10-27)。テストは ocrGateCore.test.ts。
 *
 * - 3つの関数は、アプリのサーバーだけが知る合言葉(OCR_DB_TOKEN)が無いと動かない(利用者が直接呼ぶ悪用を防ぐ)。
 * - 合言葉は、DBの関数の引数として送る(supabase-js の rpc は POST の本文で送る。URLには入らない)。
 * - ログやエラーの文言に、合言葉を出さない(DBのエラーの中身は記録しない)。
 * - 失敗したときは、画面を止めず「使えません」として扱う。
 * サーバー専用の印を付けた入口は ocrGate.ts(環境変数から合言葉を読む)。
 */
import type { OcrGateResult } from "./usageLimit.ts";

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export type BeginResult = { ok: true; reservation: string } | { ok: false; reason: OcrGateResult };

const LIMIT_RESULTS = new Set(["use_limit", "attempt_limit", "daily_user_limit", "global_limit"]);

export async function beginOcrAttemptWith(client: RpcClient, token: string | undefined): Promise<BeginResult> {
  if (!token) return { ok: false, reason: "unavailable" };
  try {
    const { data, error } = await client.rpc("begin_ocr_attempt_v2", { p_server_token: token });
    if (error || !data || typeof data !== "object") return { ok: false, reason: "unavailable" };
    const r = data as { result?: unknown; reservation?: unknown };
    if (r.result === "ok" && typeof r.reservation === "string") return { ok: true, reservation: r.reservation };
    if (typeof r.result === "string" && LIMIT_RESULTS.has(r.result)) return { ok: false, reason: r.result as OcrGateResult };
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** 成功を1回数える。その月の成功回数(分からなければ null) */
export async function completeOcrSuccessWith(client: RpcClient, token: string | undefined, reservation: string): Promise<number | null> {
  if (!token) return null;
  try {
    const { data, error } = await client.rpc("complete_ocr_success_v2", { p_server_token: token, p_reservation: reservation });
    return !error && typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

/** AI側の都合で失敗したとき、試行を取り消す(店主の回数を減らさない)。記録の種類も渡す */
export async function cancelOcrAttemptWith(
  client: RpcClient,
  token: string | undefined,
  reservation: string,
  incident: "credit" | "auth" | "busy",
): Promise<void> {
  if (!token) return;
  try {
    await client.rpc("cancel_ocr_attempt_v2", { p_server_token: token, p_reservation: reservation, p_incident: incident });
  } catch {
    // 取り消しに失敗しても、画面は止めない(試行が1回多く数えられるだけ)
  }
}
