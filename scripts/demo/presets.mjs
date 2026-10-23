// seed_demo.mjs で作るデモデータの中身(環境変数 SEED_PRESET で選ぶ。既定は basic)。
//
// 共通の形:
//   storeName      店舗名(架空)
//   ingredients    食材。history は価格の履歴(古い順。最後の値が今の単価)
//                  livestockLink は食肉の規格(ingredient_market_links に「利用者が確定した紐づけ」として保存)
//   menus          メニュー。lines はレシピ、sales は月ごとの販売数量({ "2026-09": 数量 })
//   fixedCosts     固定費(periodEnd が null なら継続中)
//   consent        true なら利用規約への同意を記録しておく(ログイン直後に同意画面を出さない)
//
// 市場価格のテーブル(market_price_observations・livestock_price_observations)には何も書き込まない。

/** これまでの seed_demo.mjs と同じ中身(画面確認・スクリーンショット用) */
export const basic = {
  storeName: "サンプル食堂",
  ingredients: [
    { name: "豚こま肉", unit: "g", history: [{ price: 1.5, at: "2026-07-01" }] },
    { name: "キャベツ", unit: "個", history: [{ price: 150, at: "2026-07-01" }] },
    { name: "米", unit: "g", history: [{ price: 0.4, at: "2026-07-01" }] },
    { name: "鶏もも肉", unit: "g", history: [{ price: 1.0, at: "2026-07-01" }] },
    { name: "揚げ油", unit: "g", history: [{ price: 0.1, at: "2026-07-01" }] },
    { name: "生ビール", unit: "杯", history: [{ price: 80, at: "2026-07-01" }] },
  ],
  menus: [
    {
      name: "生姜焼き定食",
      sellingPrice: 750,
      lines: [["豚こま肉", 120], ["キャベツ", 0.2], ["米", 180]],
      sales: { "2026-08": 90 },
    },
    {
      name: "唐揚げ定食",
      sellingPrice: 780,
      lines: [["鶏もも肉", 150], ["米", 180], ["揚げ油", 20]],
      sales: { "2026-08": 130 },
    },
    { name: "生ビール", sellingPrice: 480, lines: [["生ビール", 1]], sales: { "2026-08": 200 } },
  ],
  fixedCosts: [
    { costType: "rent", amount: 20000, periodStart: "2026-08-01", periodEnd: null },
    { costType: "labor", amount: 50000, periodStart: "2026-08-01", periodEnd: "2026-08-31" },
  ],
  consent: false,
};

/**
 * 個人の定食屋(PR動画の撮影用。2026-10-23)。
 * - 仕入れ値アラート: 本番の市場データ(10月上旬と9月下旬の比較)で、キャベツ+43%・ピーマン+14%・
 *   きゅうり+14%が値上がり、小松菜-17%が値下がり、豚肉(東京)-11%が値下がりで出る。
 *   豚こま肉・鶏もも肉は、食肉の規格に紐づけ済みにする(鶏ももは「確認が必要」に出さないため)。
 * - 今見直すべきメニュー: 生姜焼き定食(原価率 約36%)と野菜炒め定食(約37%)が目標30%を超え、値上げの目安が出る。
 *   冷奴・小松菜のおひたしは、原価率が低く「値上げ余地」側に出る。
 * - 値上げの影響額: キャベツは8月の120円→10月10日に150円、豚こま肉は1.5円→1.4円に変わった履歴を持つ。
 */
export const teishoku = {
  storeName: "定食処 こはる亭",
  ingredients: [
    { name: "豚こま肉", unit: "g", history: [{ price: 1.5, at: "2026-08-01" }, { price: 1.4, at: "2026-10-10" }], livestockLink: "pork_tokyo" },
    { name: "鶏もも肉", unit: "g", history: [{ price: 0.9, at: "2026-08-01" }], livestockLink: "chicken_thigh" },
    { name: "キャベツ", unit: "個", history: [{ price: 120, at: "2026-08-01" }, { price: 150, at: "2026-10-10" }] },
    { name: "ピーマン", unit: "個", history: [{ price: 40, at: "2026-08-01" }] },
    { name: "にんじん", unit: "本", history: [{ price: 60, at: "2026-08-01" }] },
    { name: "玉ねぎ", unit: "個", history: [{ price: 50, at: "2026-08-01" }] },
    { name: "もやし", unit: "袋", history: [{ price: 30, at: "2026-08-01" }] },
    { name: "生姜", unit: "g", history: [{ price: 2, at: "2026-08-01" }] },
    { name: "きゅうり", unit: "本", history: [{ price: 60, at: "2026-08-01" }] },
    { name: "小松菜", unit: "束", history: [{ price: 120, at: "2026-08-01" }] },
    { name: "米", unit: "g", history: [{ price: 0.4, at: "2026-08-01" }] },
    { name: "味噌", unit: "g", history: [{ price: 0.5, at: "2026-08-01" }] },
    { name: "豆腐", unit: "丁", history: [{ price: 60, at: "2026-08-01" }] },
    { name: "サバ切り身", unit: "切れ", history: [{ price: 150, at: "2026-08-01" }] },
    { name: "片栗粉", unit: "g", history: [{ price: 0.4, at: "2026-08-01" }] },
    { name: "揚げ油", unit: "g", history: [{ price: 0.3, at: "2026-08-01" }] },
    { name: "醤油", unit: "ml", history: [{ price: 0.3, at: "2026-08-01" }] },
    { name: "かつお節", unit: "g", history: [{ price: 3, at: "2026-08-01" }] },
  ],
  menus: [
    {
      name: "生姜焼き定食",
      sellingPrice: 850,
      lines: [["豚こま肉", 130], ["キャベツ", 0.08], ["生姜", 5], ["米", 200], ["味噌", 15], ["豆腐", 0.1], ["きゅうり", 0.2]],
      sales: { "2026-09": 380, "2026-10": 300 },
    },
    {
      name: "唐揚げ定食",
      sellingPrice: 950,
      lines: [["鶏もも肉", 160], ["片栗粉", 15], ["揚げ油", 20], ["キャベツ", 0.08], ["米", 200], ["味噌", 15], ["豆腐", 0.1], ["きゅうり", 0.2]],
      sales: { "2026-09": 350, "2026-10": 320 },
    },
    {
      name: "野菜炒め定食",
      sellingPrice: 780,
      lines: [["キャベツ", 0.15], ["ピーマン", 1], ["にんじん", 0.3], ["もやし", 0.5], ["玉ねぎ", 0.3], ["豚こま肉", 50], ["米", 200], ["味噌", 15], ["豆腐", 0.1], ["きゅうり", 0.2]],
      sales: { "2026-09": 220, "2026-10": 200 },
    },
    {
      name: "サバの味噌煮定食",
      sellingPrice: 950,
      lines: [["サバ切り身", 1], ["味噌", 25], ["生姜", 5], ["米", 200], ["豆腐", 0.1], ["きゅうり", 0.2]],
      sales: { "2026-09": 180, "2026-10": 170 },
    },
    {
      name: "冷奴",
      sellingPrice: 300,
      lines: [["豆腐", 0.5], ["生姜", 3], ["かつお節", 1], ["醤油", 10]],
      sales: { "2026-09": 120, "2026-10": 110 },
    },
    {
      name: "小松菜のおひたし",
      sellingPrice: 280,
      lines: [["小松菜", 0.3], ["かつお節", 1], ["醤油", 10]],
      sales: { "2026-09": 90, "2026-10": 80 },
    },
  ],
  fixedCosts: [
    { costType: "rent", amount: 90000, periodStart: "2026-09-01", periodEnd: null },
    { costType: "labor", amount: 260000, periodStart: "2026-09-01", periodEnd: null },
  ],
  consent: true,
};

export const PRESETS = { basic, teishoku };
