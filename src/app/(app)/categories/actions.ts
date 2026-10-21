"use server";

import { normalizeDisplayName, normalizeForDedupe } from "@/lib/normalize";
import { requireAuthedClient } from "@/lib/supabase/requireAuthedClient";
import { friendlyDbError, dbErrorMessage } from "@/lib/supabase/friendlyDbError";
import {
  CATEGORY_DUPLICATE_PREFIX,
  computeMovedSortOrders,
  nextSortOrder,
  validateCategoryName,
  type Category,
  type CategoryKind,
} from "@/lib/categories";

/**
 * カテゴリの追加・名前変更・並び替え・削除。
 *
 * 同じ種類(メニュー用 or 食材用)の中での名前の重複は、先にアプリ側で確認し
 * (validateCategoryName)、ほぼ同時の操作ですり抜けた場合もDBの一意制約
 * (unique(store_id, kind, normalized_name))が必ず弾く(他の画面と同じ二段構え)。
 * 店舗の確認はRLS(自分の店舗のカテゴリしか読み書きできない)に任せ、
 * 念のため各クエリでもstore_idで絞り込む。
 */

// 画面側(isDuplicateCategoryError)で重複エラーと判定し、同じとみなす範囲の注記を添えて表示する
const DUPLICATE_MESSAGE = `${CATEGORY_DUPLICATE_PREFIX}。`;

export type CategoryActionResult = { success: true; categories: Category[] } | { success: false; error: string };

function isCategoryKind(kind: string): kind is CategoryKind {
  return kind === "menu" || kind === "ingredient";
}

type Supabase = Exclude<Awaited<ReturnType<typeof requireAuthedClient>>, { error: string }>["supabase"];

/** 同じ種類のカテゴリ一覧(並び順どおり)。操作後の最新状態を画面に返すのにも使う。 */
async function fetchSameKind(
  supabase: Supabase,
  storeId: string,
  kind: CategoryKind,
): Promise<{ categories: Category[] } | { error: string }> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, kind, name, sort_order")
    .eq("store_id", storeId)
    .eq("kind", kind)
    .order("sort_order")
    .order("created_at");
  if (error) return { error: dbErrorMessage("カテゴリの取得", error) };
  return {
    categories: (data ?? []).map((r) => ({ id: r.id, kind: r.kind as CategoryKind, name: r.name, sortOrder: r.sort_order })),
  };
}

export async function createCategory(input: { storeId: string; kind: string; name: string }): Promise<CategoryActionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;
  if (!isCategoryKind(input.kind)) return { success: false, error: "カテゴリの種類が正しくありません" };

  const current = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in current) return { success: false, error: current.error };

  const name = normalizeDisplayName(input.name);
  const nameError = validateCategoryName(name, current.categories);
  if (nameError) return { success: false, error: nameError };

  const { error } = await supabase.from("categories").insert({
    store_id: input.storeId,
    kind: input.kind,
    name,
    normalized_name: normalizeForDedupe(name),
    sort_order: nextSortOrder(current.categories),
  });
  if (error) return { success: false, error: `カテゴリの追加に失敗しました: ${friendlyDbError(error, DUPLICATE_MESSAGE)}` };

  const after = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in after) return { success: false, error: after.error };
  return { success: true, categories: after.categories };
}

export async function renameCategory(input: {
  storeId: string;
  kind: string;
  categoryId: string;
  name: string;
}): Promise<CategoryActionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;
  if (!isCategoryKind(input.kind)) return { success: false, error: "カテゴリの種類が正しくありません" };

  const current = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in current) return { success: false, error: current.error };
  if (!current.categories.some((c) => c.id === input.categoryId)) {
    return { success: false, error: "カテゴリが見つかりません。画面を再読み込みしてください。" };
  }

  const name = normalizeDisplayName(input.name);
  const nameError = validateCategoryName(name, current.categories, input.categoryId);
  if (nameError) return { success: false, error: nameError };

  const { error } = await supabase
    .from("categories")
    .update({ name, normalized_name: normalizeForDedupe(name) })
    .eq("id", input.categoryId)
    .eq("store_id", input.storeId);
  if (error) return { success: false, error: `名前の変更に失敗しました: ${friendlyDbError(error, DUPLICATE_MESSAGE)}` };

  const after = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in after) return { success: false, error: after.error };
  return { success: true, categories: after.categories };
}

export async function moveCategory(input: {
  storeId: string;
  kind: string;
  categoryId: string;
  direction: "up" | "down";
}): Promise<CategoryActionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;
  if (!isCategoryKind(input.kind)) return { success: false, error: "カテゴリの種類が正しくありません" };
  if (input.direction !== "up" && input.direction !== "down") return { success: false, error: "並び替えの指定が正しくありません" };

  const current = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in current) return { success: false, error: current.error };

  // 並び順(sort_order)には一意制約が無いため、1行ずつ更新しても途中でエラーにはならない。
  // 万一途中で失敗しても、並び順がずれるだけでデータは失われない(次の操作で1から振り直される)。
  for (const change of computeMovedSortOrders(current.categories, input.categoryId, input.direction)) {
    const { error } = await supabase
      .from("categories")
      .update({ sort_order: change.sortOrder })
      .eq("id", change.id)
      .eq("store_id", input.storeId);
    if (error) return { success: false, error: dbErrorMessage("並び替え", error) };
  }

  const after = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in after) return { success: false, error: after.error };
  return { success: true, categories: after.categories };
}

/**
 * カテゴリの削除。中のメニュー・食材は削除されず、未分類に戻る
 * (DBの on delete set null。確認画面で件数を表示してから呼ぶ)。
 */
export async function deleteCategory(input: { storeId: string; kind: string; categoryId: string }): Promise<CategoryActionResult> {
  const ctx = await requireAuthedClient();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;
  if (!isCategoryKind(input.kind)) return { success: false, error: "カテゴリの種類が正しくありません" };

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", input.categoryId)
    .eq("store_id", input.storeId)
    .eq("kind", input.kind);
  if (error) return { success: false, error: dbErrorMessage("カテゴリの削除", error) };

  const after = await fetchSameKind(supabase, input.storeId, input.kind);
  if ("error" in after) return { success: false, error: after.error };
  return { success: true, categories: after.categories };
}
