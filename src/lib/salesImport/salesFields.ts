/**
 * 販売数量CSV取り込み(③メニュー別収益貢献度ランキング用)のマッピング対象フィールド。
 * ①のレシピ取り込みと同じ columnMapper.ts のロジックをそのまま使い回す
 * (mapping/fields.ts の FieldDef 型を汎用化して対応した)。
 */
import type { FieldDef } from "../mapping/fields.ts";

export type SalesFieldId = "menuName" | "quantitySold";

export const SALES_FIELD_DEFS: FieldDef<SalesFieldId>[] = [
  {
    id: "menuName",
    label: "メニュー名",
    required: true,
    kind: "text",
    synonyms: ["メニュー名", "商品名", "品名", "メニュー", "商品", "料理名"],
  },
  {
    id: "quantitySold",
    label: "販売数量",
    required: true,
    kind: "numeric",
    synonyms: ["販売数量", "販売数", "数量", "売上数", "売上数量", "個数"],
  },
];
