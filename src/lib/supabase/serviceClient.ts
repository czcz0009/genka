import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * RLSを無視できるservice roleクライアント。
 *
 * 用途は次の2つに限定する:
 * 1. 店舗非依存の公開参考データ(market_price_observations /
 *    livestock_price_observations)への定期取得バッチの書き込み
 *    (これらのテーブルは通常ユーザー向けのinsert/update/deleteポリシーを
 *    あえて用意していないため、書き込みにはservice roleが必要)
 * 2. 退会(アカウント削除)の猶予期間が過ぎたユーザーの、
 *    auth.admin.deleteUser()呼び出し(api/cron/delete-scheduled-accounts)。
 *    通常のユーザー操作(退会の申請・取り消し)自体はservice roleを使わない
 *    Server Action(accountDeletionActions.ts)で行い、実際の削除だけを
 *    cronジョブに分離している
 *
 * このクライアントはCronルートハンドラ(src/app/api/cron/**)からのみ使うこと。
 * 通常のページ・Server Actionからは絶対に使わない
 * (RLSを無視してしまうため、ユーザー入力に応じた読み書きには不適切)。
 *
 * SUPABASE_SERVICE_ROLE_KEY は NEXT_PUBLIC_ を付けないこと
 * (付けるとブラウザに公開されてしまう)。
 */
export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  if (!isServiceRoleConfigured()) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
