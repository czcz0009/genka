import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoreInfo {
  id: string;
  name: string;
  defaultTargetCostRate: number;
}

export type SessionStoreResult =
  | { status: "unauthenticated" }
  | { status: "error" }
  | { status: "ok"; store: StoreInfo };

/**
 * ログイン確認 + 店舗の取得(なければ作成)を1回のDB往復(RPC)にまとめたもの。
 *
 * 実機計測(本番Vercel東京リージョン)で判明した経緯:
 * 以前は (1) supabase.auth.getUser()(JWT検証、実測150〜400ms)→
 * (2) upsert(なければ作成、実測150〜500ms)→ (3) select(再取得、実測150〜300ms)
 * という3回の直列ネットワーク往復を毎回の画面表示のたびに行っており、
 * 合計400〜1100msかかっていた。認証確認(user.id)は「getOrCreateStoreに渡す」
 * 以外の用途がほぼ無かったため、認証確認自体をこのRPC内(auth.uid())に統合し、
 * 1回の往復で済ませる。事前に supabase/migrations/0007_get_or_create_store_rpc.sql
 * の適用が必要(SupabaseダッシュボードのSQL Editorで実行)。
 *
 * 「select→なければinsert」ではなくupsert(onConflict: owner_id, ignoreDuplicates)を
 * RPC内でも使っているのは、以前の実装からの教訓(同一ユーザーからのほぼ同時
 * リクエストでTOCTOUレース条件が発生し複数store行が作られた不具合)を踏襲するため。
 * これは `stores.owner_id` の UNIQUE制約(0004_stores_owner_unique.sql)を前提にしている。
 *
 * 未ログイン(auth.uid()がnull)の場合、RPC側が明示的にエラー(SQLSTATE 28000)を
 * 送出するため、「未ログイン」と「その他の失敗(StoreLoadError表示)」を区別できる。
 *
 * cache()でラップし、(app)/layout.tsxと各ページの両方が同一リクエスト内で
 * 呼んでも実際のRPC呼び出しは1回で済むようにしている。
 */
export const getSessionStore = cache(async function getSessionStore(
  supabase: SupabaseClient | null,
): Promise<SessionStoreResult> {
  if (!supabase) return { status: "unauthenticated" };

  const { data, error } = await supabase.rpc("get_or_create_store");
  if (error) {
    if (error.code === "28000") return { status: "unauthenticated" };
    return { status: "error" };
  }

  const row = data?.[0];
  if (!row) return { status: "error" };

  return {
    status: "ok",
    store: { id: row.id, name: row.name, defaultTargetCostRate: row.default_target_cost_rate },
  };
});
