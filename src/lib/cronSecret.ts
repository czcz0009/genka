import { createHash, timingSafeEqual } from "node:crypto";

/** 合言葉の最低の長さ。これより短い設定は、弱いので使わない(2026-10-27) */
export const MIN_CRON_SECRET_LENGTH = 32;

/**
 * 定期処理(Vercel Cron)の入口の合言葉の確認の本体。Vercelは CRON_SECRET を「Authorization: Bearer <値>」で送ってくる。
 * 比べ方は、時間差で推測されにくい timingSafeEqual(2026-10-27。点検の14番)。長さの違いでも時間が変わらないよう、
 * 両方をSHA-256にそろえてから比べる。合言葉が未設定・短すぎるときは、何が来ても通さない。
 * サーバー専用の印(server-only)を付けた cronAuth.ts から使う。テストは cronSecret.test.ts。
 */
export function matchesCronSecret(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(authorizationHeader ?? ""), digest(`Bearer ${secret}`));
}
