import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * RLSを無視できるservice roleクライアント。
 *
 * 用途は「店舗非依存の公開参考データ(market_price_observations /
 * livestock_price_observations)への定期取得バッチの書き込み」に限定する
 * (これらのテーブルは通常ユーザー向けのinsert/update/deleteポリシーを
 * あえて用意していないため、書き込みにはservice roleが必要)。
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
