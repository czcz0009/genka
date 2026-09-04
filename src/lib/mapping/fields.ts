/**
 * CSV/Excel取り込みでマッピング候補を探す「対象フィールド」の定義。
 *
 * 表記ゆれ吸収のため、各フィールドに同義語リストを持たせる。
 * ここに載っていない言い回しは類似度スコアリング(similarity.ts)で拾う。
 */

export type FieldId =
  | "menuName"
  | "ingredientName"
  | "quantity"
  | "unit"
  | "purchasePrice"
  | "sellingPrice";

export type FieldKind = "text" | "numeric" | "unit";

/**
 * マッピング対象フィールドの定義。TId を変えることで、レシピ取り込み(①)以外の
 * CSV(例: ③の販売数量インポート)にも同じマッピングエンジン(columnMapper.ts)を
 * 使い回せるようにしている。
 */
export interface FieldDef<TId extends string = FieldId> {
  id: TId;
  /** UI表示用ラベル */
  label: string;
  /** この項目がないと行として成立しないか */
  required: boolean;
  kind: FieldKind;
  /** 列ヘッダーの同義語(完全一致で高スコアになる) */
  synonyms: string[];
}

export const FIELD_DEFS: FieldDef<FieldId>[] = [
  {
    id: "menuName",
    label: "メニュー名",
    required: true,
    kind: "text",
    synonyms: ["メニュー名", "商品名", "品名", "メニュー", "商品", "レシピ名", "料理名"],
  },
  {
    id: "ingredientName",
    label: "食材名",
    required: true,
    kind: "text",
    synonyms: ["食材名", "食材", "材料名", "材料", "品目", "品目名", "原材料名", "原材料"],
  },
  {
    id: "quantity",
    label: "分量",
    required: true,
    kind: "numeric",
    synonyms: ["分量", "数量", "使用量", "使用数量", "使用量g", "量"],
  },
  {
    id: "unit",
    label: "単位",
    required: true,
    kind: "unit",
    synonyms: ["単位"],
  },
  {
    id: "purchasePrice",
    label: "仕入単価",
    required: false,
    kind: "numeric",
    synonyms: [
      "仕入単価",
      "仕入れ単価",
      "仕入価格",
      "仕入れ値",
      "仕入値",
      "購入単価",
      "仕入原価",
      "単価",
    ],
  },
  {
    id: "sellingPrice",
    label: "売価",
    required: false,
    kind: "numeric",
    synonyms: ["売価", "販売価格", "販売単価", "メニュー価格", "価格"],
  },
];

/** よく使われる単位。単位列を内容から推測するためのヒント辞書。 */
export const KNOWN_UNITS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "mL",
  "l",
  "L",
  "cc",
  "cm",
  "個",
  "本",
  "枚",
  "人前",
  "袋",
  "玉",
  "片",
  "缶",
  "パック",
  "束",
  "切れ",
  "杯",
  "合",
  "匹",
  "尾",
  "房",
  "株",
  "丁",
  "皿",
  "食",
  "人分",
  "cup",
  "カップ",
  "大さじ",
  "小さじ",
]);
