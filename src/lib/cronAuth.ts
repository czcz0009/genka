import "server-only";

/**
 * 定期実行ルート(src/app/api/cron/**)を、Vercel Cron以外から叩けないようにするガード。
 * Vercel Cronは `Authorization: Bearer <CRON_SECRET>` を付けてリクエストする
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)。
 * CRON_SECRET未設定の場合は常に拒否する(安全側)。
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
