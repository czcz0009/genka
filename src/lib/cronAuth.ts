import "server-only";
import { matchesCronSecret } from "./cronSecret.ts";

/** 定期処理の入口の合言葉の確認(比べ方の本体とテストは cronSecret.ts) */
export function isAuthorizedCronRequest(request: Request): boolean {
  return matchesCronSecret(request.headers.get("authorization"), process.env.CRON_SECRET);
}
