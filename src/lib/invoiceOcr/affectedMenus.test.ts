import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedMenus } from "./affectedMenus.ts";

// 完了画面「原価率が変わったメニュー」(2026-10-28)。期待値C-1〜C-8はMahiroが検算済み(C-7・C-8は2026-10-28の指示どおり)。
// 単価の変化: 玉ねぎ 0.25→0.297円/g、キャベツ 150→194.4円/個、にんじん 0.4→0.468円/g。ほかは変わらない。

const ing = (id: string, name: string, price: number, extra: Partial<{ priceIsSet: boolean; isPrepItem: boolean; yieldQuantity: number | null }> = {}) => ({
  id,
  name,
  currentPurchasePrice: price,
  priceIsSet: extra.priceIsSet ?? true,
  yieldRatePercent: 100,
  isPrepItem: extra.isPrepItem ?? false,
  yieldQuantity: extra.yieldQuantity ?? null,
});

const ingredients = [
  ing("onion", "玉ねぎ", 0.25),
  ing("cabbage", "キャベツ", 150),
  ing("carrot", "にんじん", 0.4),
  ing("pork", "豚こま", 1.4),
  ing("rice", "米", 0.4),
  ing("pepper", "ピーマン", 40),
  ing("tofu", "豆腐", 60),
  ing("vinegar", "酢", 0.3),
  ing("chicken", "鶏もも肉", 0, { priceIsSet: false }),
  ing("dressing", "自家製ドレッシング", 0, { isPrepItem: true, yieldQuantity: 500 }),
];
const prepItemComponents = [
  { prepItemId: "dressing", componentId: "onion", quantity: 100 },
  { prepItemId: "dressing", componentId: "vinegar", quantity: 100 },
];
const menu = (id: string, name: string, sellingPrice: number, targetCostRate: number | null = null) => ({ id, name, sellingPrice, targetCostRate });
const line = (menuId: string, ingredientId: string, quantity: number) => ({ menuId, ingredientId, quantity });

function run(target: { shogayaki?: number | null } = {}) {
  return affectedMenus({
    menus: [
      menu("shogayaki", "生姜焼き定食", 980, target.shogayaki ?? null),
      menu("yasai", "野菜炒め", 800),
      menu("hiyayakko", "冷奴", 300),
      menu("salad", "サラダ", 500),
      menu("karaage", "唐揚げ定食", 900),
    ],
    ingredients,
    menuIngredients: [
      line("shogayaki", "pork", 130),
      line("shogayaki", "onion", 50),
      line("shogayaki", "cabbage", 0.08),
      line("shogayaki", "rice", 200),
      line("yasai", "cabbage", 0.15),
      line("yasai", "carrot", 30),
      line("yasai", "onion", 40),
      line("yasai", "pepper", 1),
      line("hiyayakko", "tofu", 0.5),
      line("salad", "dressing", 50),
      line("salad", "cabbage", 0.1),
      line("karaage", "chicken", 150),
      line("karaage", "cabbage", 0.1),
    ],
    prepItemComponents,
    updates: [
      { ingredientId: "onion", newPrice: 0.297 },
      { ingredientId: "cabbage", newPrice: 194.4 },
      { ingredientId: "carrot", newPrice: 0.468 },
    ],
    defaultTargetCostRate: 30,
  });
}
const byName = (rows: ReturnType<typeof run>, name: string) => rows.find((r) => r.name === name);

test("C-1 生姜焼き定食(980円): 286.5円 29.2% → 292.402円 29.8%(+0.6ポイント)", () => {
  const r = byName(run(), "生姜焼き定食")!;
  assert.equal(r.beforeCost, 286.5);
  assert.equal(r.afterCost, 292.402);
  assert.deepEqual([r.beforeRateText, r.afterRateText, r.changeText], ["29.2%", "29.8%", "+0.6ポイント"]);
  assert.equal(r.targetLabel, null); // 目標30%(店の設定)以下
});

test("C-2 野菜炒め(800円): 84.5円 10.6% → 95.08円 11.9%(+1.3ポイント)", () => {
  const r = byName(run(), "野菜炒め")!;
  assert.equal(r.beforeCost, 84.5);
  assert.equal(r.afterCost, 95.08);
  assert.deepEqual([r.beforeRateText, r.afterRateText, r.changeText], ["10.6%", "11.9%", "+1.3ポイント"]);
});

test("C-3 冷奴(更新した食材を使っていない)は一覧に出さない", () => {
  assert.equal(byName(run(), "冷奴"), undefined);
});

test("C-4 サラダ(500円、仕込み品のドレッシング経由で玉ねぎを使う): 20.5円 4.1% → 25.41円 5.1%(+1.0ポイント)", () => {
  const r = byName(run(), "サラダ")!;
  assert.equal(r.beforeCost, 20.5);
  assert.equal(r.afterCost, 25.41);
  assert.deepEqual([r.beforeRateText, r.afterRateText, r.changeText], ["4.1%", "5.1%", "+1.0ポイント"]);
});

test("C-5 唐揚げ定食(鶏もも肉が未設定): 原価率は出さず「計算できていません(未設定: 鶏もも肉)」", () => {
  const r = byName(run(), "唐揚げ定食")!;
  assert.equal(r.afterRateText, null);
  assert.equal(r.changeText, null);
  assert.equal(r.unsetText, "計算できていません(未設定: 鶏もも肉)");
  assert.equal(r.targetLabel, null);
});

test("C-6 並び順: 変化の大きい順(野菜炒め → サラダ → 生姜焼き)、計算できていないメニューは最後", () => {
  assert.deepEqual(
    run().map((r) => r.name),
    ["野菜炒め", "サラダ", "生姜焼き定食", "唐揚げ定食"],
  );
});

test("C-7 目標29%: 変わる前(29.2%)から目標を超えていた → 「目標(29%)を超えています」", () => {
  assert.equal(byName(run({ shogayaki: 29 }), "生姜焼き定食")!.targetLabel, "目標(29%)を超えています");
});

test("C-8 目標29.5%: 変わる前(29.2%)は目標以下、変わった後(29.8%)に超えた → 「目標(29.5%)を超えました」", () => {
  assert.equal(byName(run({ shogayaki: 29.5 }), "生姜焼き定食")!.targetLabel, "目標(29.5%)を超えました");
});
