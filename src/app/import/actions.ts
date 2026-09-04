"use server";

import { createClient } from "@/lib/supabase/server";
import type { ImportPlan } from "@/lib/mapping/applyMapping";
import type { FinalMapping } from "@/lib/mapping/applyMapping";
import { FIELD_DEFS } from "@/lib/mapping/fields";

export interface SaveImportPlanInput {
  storeId: string;
  fileName: string;
  columnMapping: FinalMapping;
  headers: string[];
  errorCount: number;
  plan: ImportPlan;
}

export type SaveImportPlanResult =
  | { success: true; menuCount: number; ingredientCount: number }
  | { success: false; error: string };

/**
 * 確定した取り込み内容をSupabaseに保存する。
 *
 * 方針:
 * - 食材・メニューは (store_id, normalized_name) で既存行と突き合わせ、
 *   同じ食材/メニューが再度取り込まれても重複登録しない(①の設計方針をそのまま実装)。
 * - CSVに仕入単価/売価が入っていなかった行(null)は、既存の実データを
 *   0円やnullで上書きしてしまわないよう、既存値があればそれを優先する。
 * - 仕入単価が実際に変わった食材だけ ingredient_price_history に記録する
 *   (再取り込みのたびに同じ値の履歴が積み上がるのを防ぐ)。
 */
export async function saveImportPlan(input: SaveImportPlanInput): Promise<SaveImportPlanResult> {
  const supabase = await createClient();
  if (!supabase) return { success: false, error: "Supabaseが未設定です" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインが必要です" };

  const { plan, storeId } = input;

  // 1. 既存の食材(正規化名で突き合わせ)を取得し、価格を上書きしすぎないようにする
  const { data: existingIngredients, error: existingIngredientsError } = await supabase
    .from("ingredients")
    .select("id, normalized_name, current_purchase_price")
    .eq("store_id", storeId);
  if (existingIngredientsError) {
    return { success: false, error: `食材の取得に失敗しました: ${existingIngredientsError.message}` };
  }
  const existingIngredientByName = new Map(
    (existingIngredients ?? []).map((i) => [i.normalized_name, i]),
  );

  const nowIso = new Date().toISOString();
  const changedPriceNames = new Set<string>();
  const ingredientRows = plan.ingredients.map((ing) => {
    const existing = existingIngredientByName.get(ing.normalizedName);
    const finalPrice = ing.purchasePrice ?? existing?.current_purchase_price ?? 0;
    if (!existing || existing.current_purchase_price !== finalPrice) {
      changedPriceNames.add(ing.normalizedName);
    }
    return {
      store_id: storeId,
      name: ing.name,
      normalized_name: ing.normalizedName,
      unit: ing.unit,
      current_purchase_price: finalPrice,
      price_updated_at: nowIso,
    };
  });

  const { data: upsertedIngredients, error: ingredientUpsertError } = await supabase
    .from("ingredients")
    .upsert(ingredientRows, { onConflict: "store_id,normalized_name" })
    .select("id, normalized_name, current_purchase_price");
  if (ingredientUpsertError || !upsertedIngredients) {
    return {
      success: false,
      error: `食材の保存に失敗しました: ${ingredientUpsertError?.message ?? "不明なエラー"}`,
    };
  }
  const ingredientIdByName = new Map(upsertedIngredients.map((i) => [i.normalized_name, i.id]));

  // 価格が実際に変わった食材だけ履歴に記録する
  const priceHistoryRows = ingredientRows
    .filter((r) => changedPriceNames.has(r.normalized_name))
    .map((r) => ({
      ingredient_id: ingredientIdByName.get(r.normalized_name),
      price: r.current_purchase_price,
      recorded_at: nowIso,
    }))
    .filter((r) => r.ingredient_id != null);
  if (priceHistoryRows.length > 0) {
    await supabase.from("ingredient_price_history").insert(priceHistoryRows);
  }

  // 2. メニュー(既存の売価を空欄で上書きしない)
  const { data: existingMenus, error: existingMenusError } = await supabase
    .from("menus")
    .select("id, normalized_name, selling_price")
    .eq("store_id", storeId);
  if (existingMenusError) {
    return { success: false, error: `メニューの取得に失敗しました: ${existingMenusError.message}` };
  }
  const existingMenuByName = new Map((existingMenus ?? []).map((m) => [m.normalized_name, m]));

  const menuRows = plan.menus.map((menu) => {
    const existing = existingMenuByName.get(menu.normalizedName);
    return {
      store_id: storeId,
      name: menu.name,
      normalized_name: menu.normalizedName,
      selling_price: menu.sellingPrice ?? existing?.selling_price ?? null,
    };
  });

  const { data: upsertedMenus, error: menuUpsertError } = await supabase
    .from("menus")
    .upsert(menuRows, { onConflict: "store_id,normalized_name" })
    .select("id, normalized_name");
  if (menuUpsertError || !upsertedMenus) {
    return { success: false, error: `メニューの保存に失敗しました: ${menuUpsertError?.message ?? "不明なエラー"}` };
  }
  const menuIdByName = new Map(upsertedMenus.map((m) => [m.normalized_name, m.id]));

  // 3. メニュー×食材(レシピ明細)
  const menuIngredientRows = plan.menus.flatMap((menu) => {
    const menuId = menuIdByName.get(menu.normalizedName);
    if (!menuId) return [];
    return menu.ingredients.map((mi) => ({
      menu_id: menuId,
      ingredient_id: ingredientIdByName.get(mi.ingredientNormalizedName),
      quantity: mi.quantity,
      unit: mi.unit,
    }));
  }).filter((r) => r.ingredient_id != null);

  if (menuIngredientRows.length > 0) {
    const { error: menuIngredientError } = await supabase
      .from("menu_ingredients")
      .upsert(menuIngredientRows, { onConflict: "menu_id,ingredient_id" });
    if (menuIngredientError) {
      return { success: false, error: `レシピ明細の保存に失敗しました: ${menuIngredientError.message}` };
    }
  }

  // 4. 監査用ログ
  const columnMappingSummary = Object.fromEntries(
    FIELD_DEFS.map((f) => [
      f.id,
      input.columnMapping[f.id] != null ? input.headers[input.columnMapping[f.id] as number] : null,
    ]),
  );
  await supabase.from("import_jobs").insert({
    store_id: storeId,
    file_name: input.fileName,
    column_mapping: columnMappingSummary,
    row_count: plan.menus.reduce((sum, m) => sum + m.ingredients.length, 0),
    error_count: input.errorCount,
  });

  return { success: true, menuCount: plan.menus.length, ingredientCount: plan.ingredients.length };
}
