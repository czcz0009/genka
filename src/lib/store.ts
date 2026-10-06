import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientPriceTaxMode } from "./taxMode.ts";
import type { PriceHistoryEntry } from "./ingredientPriceHistory.ts";
import type { Category, CategoryKind } from "./categories.ts";

export type { IngredientPriceTaxMode } from "./taxMode.ts";

export interface StoreInfo {
  id: string;
  name: string;
  defaultTargetCostRate: number;
  ingredientPriceTaxMode: IngredientPriceTaxMode;
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
    store: {
      id: row.id,
      name: row.name,
      defaultTargetCostRate: row.default_target_cost_rate,
      ingredientPriceTaxMode: (row.ingredient_price_tax_mode as IngredientPriceTaxMode | null) ?? "exclusive",
    },
  };
});

export interface StoreDataMenu {
  id: string;
  name: string;
  sellingPrice: number | null;
  targetCostRate: number | null;
  createdAt: string;
  /** カテゴリ(null=未分類)。整理用で、原価計算等には使わない。 */
  categoryId: string | null;
}

export interface StoreDataIngredient {
  id: string;
  name: string;
  currentPurchasePrice: number;
  /**
   * 単価が入力済みかどうか。falseなら未設定(current_purchase_priceは
   * 参考値の0円で、実際の単価としては使わない)。仕込み品には適用されない
   * (常にfalse。有効性は材料の組み合わせから別途判定する)。
   */
  priceIsSet: boolean;
  /** 歩留まり率(%)。100(初期値)なら歩留まりなし=従来通りの計算。 */
  yieldRatePercent: number;
  /** 仕込み品(サブレシピ)かどうか。trueの場合、currentPurchasePriceは使わない。 */
  isPrepItem: boolean;
  /** 仕込み品の場合のみ使う。1回の仕込みでできる量(unitと同じ単位)。 */
  yieldQuantity: number | null;
}

export interface StoreDataMenuIngredient {
  menuId: string;
  ingredientId: string;
  quantity: number;
}

/** 仕込み品のレシピ明細(menuIngredientsと同じ形。親が仕込み品自身である点が異なる)。 */
export interface StoreDataPrepItemComponent {
  prepItemId: string;
  componentId: string;
  quantity: number;
}

export interface StoreDataSale {
  menuId: string;
  quantitySold: number;
  periodStart: string;
  periodEnd: string;
}

export interface StoreDataFixedCost {
  costType: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
}

export interface StoreData {
  store: StoreInfo;
  menus: StoreDataMenu[];
  ingredients: StoreDataIngredient[];
  menuIngredients: StoreDataMenuIngredient[];
  prepItemComponents: StoreDataPrepItemComponent[];
  sales: StoreDataSale[];
  fixedCosts: StoreDataFixedCost[];
}

interface RawStoreDataRow {
  store: { id: string; name: string; default_target_cost_rate: number; ingredient_price_tax_mode: string };
  menus: {
    id: string;
    name: string;
    selling_price: number | null;
    target_cost_rate: number | null;
    created_at: string;
    // 0025マイグレーションで追加。未適用のDBでも動くよう省略可にしている。
    category_id?: string | null;
  }[];
  ingredients: {
    id: string;
    name: string;
    current_purchase_price: number;
    price_is_set: boolean;
    yield_rate_percent: number;
    is_prep_item: boolean;
    yield_quantity: number | null;
  }[];
  menu_ingredients: { menu_id: string; ingredient_id: string; quantity: number }[];
  prep_item_components: { prep_item_id: string; component_id: string; quantity: number }[];
  sales: { menu_id: string; quantity_sold: number; period_start: string; period_end: string }[];
  fixed_costs: { cost_type: string; amount: number; period_start: string; period_end: string }[];
}

/**
 * メニュー一覧・収益ランキング・FL比率・仕入れ値アラートが共通して必要とする
 * store配下のデータ(menus・ingredients・menu_ingredients・menu_sales・
 * store_fixed_costs)を1回のRPC(get_store_data、0008マイグレーション)で
 * まとめて取得する。
 *
 * 実機計測の経緯: VercelとSupabaseが別リージョンだったことが判明・是正した後も
 * (0007のRPC化だけでは)各画面が持つ3〜5テーブルのPromise.all並列取得の分だけ
 * 往復が発生していた。並列化されていても「一番遅いクエリの時間」は待つ必要が
 * あるため、往復そのものを1回にまとめてさらに削減する。
 *
 * salesFrom/salesToは販売実績(menu_sales)の絞り込み用(FL比率画面は直近
 * 6ヶ月分だけで良いため)。省略すると全期間を返す。
 *
 * cache()でラップし、同一リクエスト内で同じ引数の呼び出しが重複しないようにする
 * (例: ダッシュボードの複数の集計関数が同じ範囲を必要とする場合)。
 */
export const getStoreData = cache(async function getStoreData(
  supabase: SupabaseClient,
  salesFrom?: string | null,
  salesTo?: string | null,
): Promise<StoreData | null> {
  const { data, error } = await supabase.rpc("get_store_data", {
    p_sales_from: salesFrom ?? null,
    p_sales_to: salesTo ?? null,
  });
  if (error || !data) return null;

  const raw = data as RawStoreDataRow;
  return {
    store: {
      id: raw.store.id,
      name: raw.store.name,
      defaultTargetCostRate: raw.store.default_target_cost_rate,
      ingredientPriceTaxMode: (raw.store.ingredient_price_tax_mode as IngredientPriceTaxMode | null) ?? "exclusive",
    },
    menus: raw.menus.map((m) => ({
      id: m.id,
      name: m.name,
      sellingPrice: m.selling_price,
      targetCostRate: m.target_cost_rate,
      createdAt: m.created_at,
      categoryId: m.category_id ?? null,
    })),
    ingredients: raw.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      currentPurchasePrice: i.current_purchase_price,
      priceIsSet: i.price_is_set,
      yieldRatePercent: i.yield_rate_percent,
      isPrepItem: i.is_prep_item,
      yieldQuantity: i.yield_quantity,
    })),
    menuIngredients: raw.menu_ingredients.map((mi) => ({
      menuId: mi.menu_id,
      ingredientId: mi.ingredient_id,
      quantity: mi.quantity,
    })),
    prepItemComponents: raw.prep_item_components.map((pc) => ({
      prepItemId: pc.prep_item_id,
      componentId: pc.component_id,
      quantity: pc.quantity,
    })),
    sales: raw.sales.map((s) => ({
      menuId: s.menu_id,
      quantitySold: s.quantity_sold,
      periodStart: s.period_start,
      periodEnd: s.period_end,
    })),
    fixedCosts: raw.fixed_costs.map((f) => ({
      costType: f.cost_type,
      amount: f.amount,
      periodStart: f.period_start,
      periodEnd: f.period_end,
    })),
  };
});

// 「1つ前の仕入単価」を取得していた getIngredientPreviousPrices(DBの関数 get_ingredient_previous_prices を
// 呼ぶもの)は削除した(2026-10-06)。履歴の「未設定」の印を見ずに直近2件目の価格を返すため、
// 未設定(0円)→設定済みの変化を値上がりと誤認していた。今は下の getIngredientPriceHistory の
// 全件の履歴から resolvePreviousPurchasePrices(ingredientPriceHistory.ts)で判定する。
// DBの関数自体は残っている(どこからも呼ばれていない)。

/**
 * 食材ごとの仕入単価の変更履歴を全件まとめて取得する。
 *
 * 「今見直すべきメニュー」画面で過去の月を見たとき・「FL比率」画面の月次推移で、
 * その月の時点で実際に使われていた仕入単価を再現する(ingredientPriceHistory.ts の
 * resolveHistoricalPriceで解決する)ために使う。get_ingredient_previous_prices(直近2件のみ)
 * では過去の任意の月を再現できないため、別のRPC(0013マイグレーション)で全件取得する。
 *
 * cache()でラップし、同一リクエスト内での重複呼び出しを避ける。
 */
export const getIngredientPriceHistory = cache(async function getIngredientPriceHistory(
  supabase: SupabaseClient,
): Promise<PriceHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_ingredient_price_history");
  if (error || !data) return [];
  const rows = data as { ingredient_id: string; price: number; recorded_at: string; price_is_set: boolean }[];
  return rows.map((r) => ({
    ingredientId: r.ingredient_id,
    price: r.price,
    recordedAt: r.recorded_at,
    priceIsSet: r.price_is_set,
  }));
});

/**
 * 自分の店舗のカテゴリ一覧(メニュー用・食材用の両方)を取得する(0025マイグレーションの
 * get_categories)。デフォルトカテゴリがまだ作られていない店舗(作成に失敗した店舗)は、
 * このRPCの中で自動的に補われる。
 *
 * カテゴリは任意の整理機能のため、取得に失敗しても画面は止めず空配列を返す
 * (タブが「すべて」だけになるだけで、一覧・計算はそのまま使える)。
 *
 * cache()でラップし、同一リクエスト内での重複呼び出しを避ける。
 */
export const getCategories = cache(async function getCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase.rpc("get_categories");
  if (error || !data) {
    if (error) console.error("[get_categories]", error);
    return [];
  }
  const rows = data as { id: string; kind: CategoryKind; name: string; sort_order: number }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, sortOrder: r.sort_order }));
});
