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

export interface StoreDataMenu {
  id: string;
  name: string;
  sellingPrice: number | null;
  targetCostRate: number | null;
  createdAt: string;
}

export interface StoreDataIngredient {
  id: string;
  name: string;
  currentPurchasePrice: number;
}

export interface StoreDataMenuIngredient {
  menuId: string;
  ingredientId: string;
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
  sales: StoreDataSale[];
  fixedCosts: StoreDataFixedCost[];
}

interface RawStoreDataRow {
  store: { id: string; name: string; default_target_cost_rate: number };
  menus: { id: string; name: string; selling_price: number | null; target_cost_rate: number | null; created_at: string }[];
  ingredients: { id: string; name: string; current_purchase_price: number }[];
  menu_ingredients: { menu_id: string; ingredient_id: string; quantity: number }[];
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
    },
    menus: raw.menus.map((m) => ({
      id: m.id,
      name: m.name,
      sellingPrice: m.selling_price,
      targetCostRate: m.target_cost_rate,
      createdAt: m.created_at,
    })),
    ingredients: raw.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      currentPurchasePrice: i.current_purchase_price,
    })),
    menuIngredients: raw.menu_ingredients.map((mi) => ({
      menuId: mi.menu_id,
      ingredientId: mi.ingredient_id,
      quantity: mi.quantity,
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
