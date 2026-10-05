import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryKind } from "./categories.ts";
import { dbErrorMessage } from "./supabase/friendlyDbError.ts";

/**
 * メニュー・食材にカテゴリを付けて保存する前の確認。
 *
 * DBの外部キーは「categoriesに存在するID」かどうかしか見ないため、
 * 別の店舗のカテゴリや、別の種類(メニューに食材用カテゴリ等)のカテゴリを
 * 指定されても保存できてしまう。保存処理(server action)の側で、
 * 「同じ店舗・同じ種類のカテゴリか」を確かめる。
 *
 * null(未分類)はそのまま許可する。問題なければnull、あればエラーメッセージを返す。
 */
export async function validateCategoryAssignment(
  supabase: SupabaseClient,
  storeId: string,
  kind: CategoryKind,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (categoryId == null) return null;
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("store_id", storeId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) return dbErrorMessage("カテゴリの確認", error);
  if (!data) return "選んだカテゴリが見つかりません。画面を再読み込みしてから、もう一度お試しください。";
  return null;
}
