import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ログインユーザーの店舗を取得し、なければ作成する(MVPは1ユーザー1店舗)。
 * 呼び出し側で認証済みであることを確認してから呼ぶこと。
 *
 * 「select→なければinsert」という素朴な実装は、同一ユーザーからのほぼ同時リクエスト
 * (ページの初回レンダリングとNext.jsのプリフェッチが重なる等)でTOCTOUレース条件が
 * 発生し、実際に同一ユーザーに対して複数のstore行が作られる不具合を実機テストで
 * 確認した。そのため upsert(onConflict: owner_id, ignoreDuplicates) + 再取得という
 * レース安全な形にしている。これは `stores.owner_id` の UNIQUE制約
 * (0004_stores_owner_unique.sql)を前提にしている。
 *
 * cache()でラップしているのは、サイドバー導入(デザイン刷新)以降、
 * (app)/layout.tsx(サイドバーの店舗名表示用)と各ページの両方がこの関数を
 * 同じリクエスト内で呼ぶようになり、ナビゲーションのたびにupsert+selectが
 * 二重に走ってタブ切り替えが遅くなっていたため。同一リクエスト内で
 * supabase(createClientも合わせてcache化)・userIdが同じ呼び出しは
 * 1回の実行結果を共有する。
 */
export const getOrCreateStore = cache(async function getOrCreateStore(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; name: string; defaultTargetCostRate: number } | null> {
  const { error: upsertError } = await supabase
    .from("stores")
    .upsert(
      { owner_id: userId, name: "マイ店舗", default_target_cost_rate: 30 },
      { onConflict: "owner_id", ignoreDuplicates: true },
    );
  if (upsertError) return null;

  const { data, error: selectError } = await supabase
    .from("stores")
    .select("id, name, default_target_cost_rate")
    .eq("owner_id", userId)
    .single();
  if (selectError || !data) return null;

  return { id: data.id, name: data.name, defaultTargetCostRate: data.default_target_cost_rate };
});
