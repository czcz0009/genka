import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePreviousPurchasePrices, type PriceHistoryEntry } from "./ingredientPriceHistory.ts";
import { buildMenuRanking, sumOverTargetMonthlyProfitImpact } from "./menuRanking.ts";

/**
 * 「1つ前の単価」(今見直すべきメニューの月間影響額・ダッシュボードの影響額に使う)。
 *
 * 不具合: DBの関数get_ingredient_previous_pricesは履歴の「未設定」の印を見ずに
 * 直近2件目の価格を返していたため、未設定(0円)の食材に後から単価を入れると
 * 「0円から値上がりした」と扱われ、大きなマイナスの影響額が出ていた。
 * 対応: 全件の価格履歴(未設定の印つき)から、アプリ側で判定する。
 * 1つ前か今の記録が未設定なら「1つ前の単価は分からない」とし、影響額は出さない。
 */

const h = (ingredientId: string, price: number, priceIsSet: boolean, recordedAt: string): PriceHistoryEntry => ({
  ingredientId,
  price,
  priceIsSet,
  recordedAt,
});

test("1つ前の単価: 設定済み→設定済みの変更なら、1つ前の単価が分かる", () => {
  const map = resolvePreviousPurchasePrices([h("a", 1.5, true, "2026-08-01T00:00:00Z"), h("a", 1.8, true, "2026-09-10T00:00:00Z")]);
  assert.deepEqual(map.get("a"), { kind: "known", price: 1.5 });
});

test("1つ前の単価: 未設定(0円)→設定済みなら「分からない」", () => {
  const map = resolvePreviousPurchasePrices([h("a", 0, false, "2026-07-01T00:00:00Z"), h("a", 2, true, "2026-09-10T00:00:00Z")]);
  assert.deepEqual(map.get("a"), { kind: "unknown" });
});

test("1つ前の単価: 設定済み→未設定に戻ったものも「分からない」", () => {
  const map = resolvePreviousPurchasePrices([h("a", 2, true, "2026-07-01T00:00:00Z"), h("a", 0, false, "2026-09-10T00:00:00Z")]);
  assert.deepEqual(map.get("a"), { kind: "unknown" });
});

test("1つ前の単価: 記録が1件だけ(一度も変わっていない)なら対象外(変化なしとして扱う)", () => {
  const map = resolvePreviousPurchasePrices([h("a", 2, true, "2026-07-01T00:00:00Z")]);
  assert.equal(map.has("a"), false);
});

test("1つ前の単価: 記録の並び順に関係なく、日時が新しい順の2件目を使う(3件以上あっても直近の2件だけを見る)", () => {
  const map = resolvePreviousPurchasePrices([
    h("a", 1.8, true, "2026-09-10T00:00:00Z"),
    h("a", 0, false, "2026-05-01T00:00:00Z"),
    h("a", 1.5, true, "2026-08-01T00:00:00Z"),
  ]);
  assert.deepEqual(map.get("a"), { kind: "known", price: 1.5 });
});

// R1: 豚肉の履歴が「7/1に未設定(0円)」→「9/10に2円/gを設定」。今月100食、1食あたり150g。
function rankingForR1() {
  const previous = resolvePreviousPurchasePrices([h("pork", 0, false, "2026-07-01T00:00:00Z"), h("pork", 2, true, "2026-09-10T00:00:00Z")]);
  const prev = previous.get("pork");
  return buildMenuRanking({
    menus: [
      { id: "ginger", name: "生姜焼き定食", sellingPrice: 800, targetCostRate: null },
      { id: "salad", name: "サラダ", sellingPrice: 300, targetCostRate: null },
    ],
    menuIngredients: [
      { menuId: "ginger", ingredientId: "pork", quantity: 150 },
      { menuId: "salad", ingredientId: "cabbage", quantity: 100 },
    ],
    ingredients: [
      {
        id: "pork",
        currentPurchasePrice: 2,
        priceIsSet: true,
        previousPurchasePrice: prev?.kind === "known" ? prev.price : null,
        previousPriceUnknown: prev?.kind === "unknown",
      },
      // キャベツは0.2円/g→0.3円/gに値上がり(1つ前の単価が分かる普通のケース)
      { id: "cabbage", currentPurchasePrice: 0.3, priceIsSet: true, previousPurchasePrice: 0.2 },
    ],
    sales: [
      { menuId: "ginger", quantitySold: 100 },
      { menuId: "salad", quantitySold: 100 },
    ],
    defaultTargetCostRate: 30,
  });
}

test("R1: 未設定→設定済みになった豚肉を使う生姜焼き定食の月間影響額は「-」(null)。以前は-30,000円と出ていた", () => {
  const ginger = rankingForR1().find((s) => s.menuId === "ginger")!;
  assert.equal(ginger.monthlyProfitImpact, null);
  assert.equal(ginger.previousPriceUnknown, true);
});

test("R1: 1つ前の単価が分かる食材だけのメニューは、これまでどおり月間影響額が出る(サラダ: (20円-30円)×100食=-1,000円)", () => {
  const salad = rankingForR1().find((s) => s.menuId === "salad")!;
  assert.ok(Math.abs(salad.monthlyProfitImpact! - -1_000) < 1e-9);
  assert.equal(salad.previousPriceUnknown, false);
});

test("R1: ダッシュボードの影響額の合計にも含めない(生姜焼き定食は目標超過でも合計に入らない)", () => {
  const summaries = rankingForR1();
  const ginger = summaries.find((s) => s.menuId === "ginger")!;
  assert.equal(ginger.overTarget, true); // 原価300円÷売価800円=37.5% > 目標30%
  // サラダは目標内(30円÷300円=10%)なので合計の対象外。目標超過は生姜焼き定食だけで、それが「分からない」ので合計は出さない(null)
  assert.equal(sumOverTargetMonthlyProfitImpact(summaries), null);
});
