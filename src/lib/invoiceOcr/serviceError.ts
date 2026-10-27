/**
 * AI(Anthropic)の呼び出しが失敗したときの分け方(2026-10-27)。テストは serviceError.test.ts。
 *
 * - unavailable: こちら側・AI側の都合(残高不足・鍵の問題・混雑・障害・通信の失敗)。店主のせいではないので、
 *   回数を減らさず(試行を取り消す)、「ただいま読み取りを使えません」を出す。incident は記録の種類。
 * - content: 写真の側の問題(読めない画像・大きすぎる等)。今までどおり試行1回として数える。
 * 残高不足は、Anthropicの「credit balance is too low」(400)か、支払いの問題(402・billing_error)で判定する。
 */

export type AiErrorClass = { kind: "unavailable"; incident: "credit" | "auth" | "busy" } | { kind: "content"; incident: null };

export function classifyAiError(e: unknown): AiErrorClass {
  if (!e || typeof e !== "object") return { kind: "unavailable", incident: "busy" };
  const err = e as { status?: number; name?: string; message?: string; error?: { type?: string; error?: { type?: string; message?: string } } };
  const status = typeof err.status === "number" ? err.status : null;
  const type = err.error?.error?.type ?? err.error?.type ?? "";
  const message = `${err.message ?? ""} ${err.error?.error?.message ?? ""}`.toLowerCase();

  if (status === 402 || type === "billing_error" || message.includes("credit balance")) return { kind: "unavailable", incident: "credit" };
  if (status === 401 || status === 403) return { kind: "unavailable", incident: "auth" };
  if (status === 429 || status === 529 || (status != null && status >= 500)) return { kind: "unavailable", incident: "busy" };
  if (status === null) return { kind: "unavailable", incident: "busy" }; // 通信の失敗など、応答が無い
  if (status === 400 || status === 413 || status === 422) return { kind: "content", incident: null };
  return { kind: "unavailable", incident: "busy" };
}
