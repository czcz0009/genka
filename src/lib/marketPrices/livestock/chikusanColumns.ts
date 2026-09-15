/**
 * 農水省「畜産物卸売価格の推移(月報告)」PDFの列定義。
 *
 * この表の列構成(左から11列)は固定フォーマットであり、月ごとにレイアウトの
 * ピクセル位置が多少ズレることはあっても、列の並び順・意味が変わることは
 * (フォーマット改定がない限り)ない。そのため:
 * - 「どの数値がどの列か」は毎回PDFから位置(x座標)クラスタリングで機械的に検出する
 *   (parseChikusanPdf.ts)。これはレイアウトの微妙なズレに強い。
 * - 「その列が何を意味するか」は、実データ(2026年8月分)を取得して見出しの
 *   4段構成(品目/規格/市場/指標)を実際に読み解いた結果をここに固定値として
 *   持たせている。値の妥当性(例: 全国の豚と畜頭数が月間130万頭前後、
 *   鶏もも肉が鶏むね肉より高いこと等)でも整合性を確認済み。
 *
 * 【不具合修正】見出しテキストをPDFの位置情報だけから毎回自動再構成しようとすると、
 * 「成牛」(全国と畜頭数の2列目の見出し)と「（Ｍ）」(鶏卵 東京の見出し)が
 * 幾何情報だけでは隣接して見え、あたかも1つの見出し「成牛（Ｍ）」であるかのように
 * 誤認識されるという事象が実際に起きていた。この誤認識の結果、index 8 は
 * 「成牛(Ｍ) 価格」(牛肉の規格)として実装されていたが、実データで検算した
 * ところ値の水準(290〜330円/kg台)が牛肉他規格(1,100〜2,000円台)と
 * 明らかに合わず、正しくは表の見出し階層通り「鶏卵 東京(Ｍサイズ)」の価格
 * だったことが判明したため訂正した(index 8 = egg_m_tokyo)。あわせて、
 * index 7の見出しも「全国と畜頭数(牛)」ではなく実際は「全国と畜頭数(成牛)」
 * だったため、ラベルを訂正した(itemCodeはnullのままで計算には影響しない)。
 */

export type ChikusanItemCode =
  | "pork_tokyo"
  | "wagyu_a5"
  | "wagyu_a4"
  | "cross_b3"
  | "dairy_b2"
  | "egg_m_tokyo"
  | "chicken_thigh"
  | "chicken_breast";

export interface ChikusanColumnDef {
  /** 表の左から数えた列インデックス(0始まり) */
  index: number;
  /** 価格そのものではない(頭数などの)補助列には null */
  itemCode: ChikusanItemCode | null;
  label: string;
  unit: "yen_per_kg" | "head_count";
}

/** 実データで確認した左から11列の並び順・意味。 */
export const CHIKUSAN_COLUMNS: ChikusanColumnDef[] = [
  { index: 0, itemCode: "pork_tokyo", label: "豚肉(極上・上) 東京 価格", unit: "yen_per_kg" },
  { index: 1, itemCode: null, label: "豚肉(極上・上) 東京 頭数", unit: "head_count" },
  { index: 2, itemCode: "wagyu_a5", label: "牛肉 和牛去勢Ａ５ 東京(加重平均価格)", unit: "yen_per_kg" },
  { index: 3, itemCode: "wagyu_a4", label: "牛肉 和牛去勢Ａ４ 東京(加重平均価格)", unit: "yen_per_kg" },
  { index: 4, itemCode: "cross_b3", label: "牛肉 交雑去勢Ｂ３ 東京(加重平均価格)", unit: "yen_per_kg" },
  { index: 5, itemCode: "dairy_b2", label: "牛肉 乳用種去勢Ｂ２ 東京(加重平均価格)", unit: "yen_per_kg" },
  { index: 6, itemCode: null, label: "全国と畜頭数(豚)", unit: "head_count" },
  { index: 7, itemCode: null, label: "全国と畜頭数(成牛)", unit: "head_count" },
  { index: 8, itemCode: "egg_m_tokyo", label: "鶏卵(Ｍ) 東京", unit: "yen_per_kg" },
  { index: 9, itemCode: "chicken_thigh", label: "鶏肉もも 東京", unit: "yen_per_kg" },
  { index: 10, itemCode: "chicken_breast", label: "鶏肉むね 東京", unit: "yen_per_kg" },
];

/**
 * ①のCSVマッピング(fields.ts)と同じ発想の同義語辞書。店主の食材名との突き合わせに使う。
 *
 * egg_m_tokyoは、現時点ではsuggestChikusanItem.tsのNON_MEAT_KEYWORDS(「卵」を含む食材名は
 * 畜産物の対象外にする除外リスト)により実際には候補として提示されない
 * (「成牛(M)」からの訂正で新設した項目のため、まだ卵の食材と紐付ける機能自体を
 * 有効化していない)。将来、鶏卵の価格追跡に対応する場合はここが起点になる。
 */
export const CHIKUSAN_ITEM_ALIASES: Record<ChikusanItemCode, string[]> = {
  pork_tokyo: ["豚肉", "豚バラ", "豚もも", "豚ロース"],
  wagyu_a5: ["和牛A5", "和牛Ａ５", "黒毛和牛A5"],
  wagyu_a4: ["和牛A4", "和牛Ａ４", "黒毛和牛A4"],
  cross_b3: ["交雑牛", "交雑種", "交雑牛B3"],
  dairy_b2: ["乳用牛", "乳牛", "乳用種"],
  egg_m_tokyo: ["鶏卵", "卵", "Mサイズ卵"],
  chicken_thigh: ["鶏もも", "鶏もも肉", "もも肉", "鶏肉もも"],
  chicken_breast: ["鶏むね", "鶏むね肉", "むね肉", "鶏肉むね", "ささみ"],
};
