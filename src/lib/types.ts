/**
 * ドメイン型定義。
 *
 * MVPのデータモデル方針:
 * - 1店舗 = 1ユーザー(将来複数店舗に拡張しても壊れないよう store_id は最初から持たせる)
 * - 食材(ingredient)は店舗内で名前が重複しないよう正規化名(normalizedName)で一意管理する
 *   -> 「食材登録時にデータが重複する」という類似アプリの既知バグを避けるための設計。
 * - レシピ(menu)は「メニュー × 食材リスト」の構造。中間テーブル menu_ingredients が
 *   食材ごとの分量・単位を持つ。
 */

/** 仕入れ・分量の単位。自由入力だが、既知単位は正規化候補として扱う。 */
export type Unit = string;

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  /** 店舗全体のデフォルト目標原価率(%)。メニュー個別に上書き可能。 */
  defaultTargetCostRate: number;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  storeId: string;
  /** 表示用の食材名(ユーザー入力そのまま) */
  name: string;
  /** 重複検知用に正規化した名前(NFKC正規化・空白除去・大文字小文字統一など) */
  normalizedName: string;
  unit: Unit;
  /** 現在の仕入単価(unit あたり) */
  currentPurchasePrice: number;
  priceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientPriceHistory {
  id: string;
  ingredientId: string;
  price: number;
  recordedAt: string;
}

export interface Menu {
  id: string;
  storeId: string;
  name: string;
  normalizedName: string;
  sellingPrice: number | null;
  /** メニュー個別の目標原価率(%)。未設定なら店舗デフォルトを使う。 */
  targetCostRate: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuIngredient {
  id: string;
  menuId: string;
  ingredientId: string;
  quantity: number;
  unit: Unit;
}

export interface MenuSale {
  id: string;
  menuId: string;
  periodStart: string;
  periodEnd: string;
  quantitySold: number;
}

/** 原価率・利益貢献度の計算結果(表示用の派生データ、DBには保存しない) */
export interface MenuCostSummary {
  menuId: string;
  menuName: string;
  sellingPrice: number | null;
  totalCost: number;
  costRate: number | null;
  targetCostRate: number;
  overTarget: boolean;
  quantitySold: number;
  profitContribution: number | null;
  /** 目標原価率を満たすための値上げ目安額(切り上げ) */
  suggestedPriceIncrease: number | null;
}
