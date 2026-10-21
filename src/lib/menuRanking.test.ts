import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuRanking, findPriceHeadroomMenus } from "./menuRanking.ts";
import type { MenuCostSummary } from "./types.ts";

function summary(partial: Partial<MenuCostSummary> & { menuId: string }): MenuCostSummary {
  return {
    menuName: "",
    sellingPrice: null,
    totalCost: 0,
    costRate: null,
    targetCostRate: 30,
    overTarget: false,
    quantitySold: 0,
    profitContribution: null,
    suggestedPriceIncrease: null,
    monthlyProfitImpact: null,
    hasUnsetIngredient: false,
    unsetIngredients: [],
    ...partial,
  };
}

const ingredients = [
  { id: "pasta", currentPurchasePrice: 0.8, priceIsSet: true }, // 円/g
  { id: "ketchup", currentPurchasePrice: 0.5, priceIsSet: true },
];

test("利益貢献度(販売数量×(売価-原価))の降順で並ぶ", () => {
  const menus = [
    { id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 },
    { id: "m2", name: "ミートソース", sellingPrice: 1000, targetCostRate: 30 },
  ];
  const menuIngredients = [
    { menuId: "m1", ingredientId: "pasta", quantity: 120 }, // 原価96円
    { menuId: "m2", ingredientId: "pasta", quantity: 120 }, // 原価96円
  ];
  const sales = [
    { menuId: "m1", quantitySold: 100 }, // 貢献度: 100*(900-96)=80,400
    { menuId: "m2", quantitySold: 10 }, // 貢献度: 10*(1000-96)=9,040
  ];

  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(ranking[0].menuId, "m1");
  assert.equal(ranking[1].menuId, "m2");
  assert.ok(Math.abs(ranking[0].profitContribution! - 80400) < 1e-9);
});

test("原価率が目標を超えているメニューはoverTarget=trueになり、値上げ目安額が入る", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 300, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 120 }]; // 原価96円 -> 原価率32%
  const sales = [{ menuId: "m1", quantitySold: 5 }];

  const [summary] = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(summary.overTarget, true);
  assert.ok(summary.suggestedPriceIncrease! > 0);
});

test("目標原価率以下のメニューはoverTarget=falseで値上げ目安額は0", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 120 }]; // 原価率10.7%
  const sales = [{ menuId: "m1", quantitySold: 5 }];

  const [summary] = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(summary.overTarget, false);
  assert.equal(summary.suggestedPriceIncrease, 0);
});

test("メニュー個別の目標原価率が優先される(未設定ならdefaultTargetCostRate)", () => {
  const menus = [
    { id: "m1", name: "特別メニュー", sellingPrice: 300, targetCostRate: 40 }, // 原価率32% < 40% -> OK
    { id: "m2", name: "通常メニュー", sellingPrice: 300, targetCostRate: null }, // defaultの30%を使う -> 32%>30% -> NG
  ];
  const menuIngredients = [
    { menuId: "m1", ingredientId: "pasta", quantity: 120 },
    { menuId: "m2", ingredientId: "pasta", quantity: 120 },
  ];
  const sales: never[] = [];

  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  const m1 = ranking.find((r) => r.menuId === "m1")!;
  const m2 = ranking.find((r) => r.menuId === "m2")!;
  assert.equal(m1.overTarget, false);
  assert.equal(m2.overTarget, true);
  assert.equal(m2.targetCostRate, 30);
});

test("販売数量が記録されていないメニューは0件として扱う(エラーにしない)", () => {
  const menus = [{ id: "m1", name: "新メニュー", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 120 }];
  const [summary] = buildMenuRanking({ menus, menuIngredients, ingredients, sales: [], defaultTargetCostRate: 30 });
  assert.equal(summary.quantitySold, 0);
  assert.equal(summary.profitContribution, 0);
});

test("優先度: 目標原価率を超えているメニューは、利益貢献度が高い健全なメニューより先に表示される", () => {
  const menus = [
    { id: "healthy", name: "健全メニュー", sellingPrice: 1000, targetCostRate: 30 }, // 原価96円->9.6%、貢献度は大きい
    { id: "over", name: "要対応メニュー", sellingPrice: 300, targetCostRate: 30 }, // 原価96円->32%、貢献度は小さい
  ];
  const menuIngredients = [
    { menuId: "healthy", ingredientId: "pasta", quantity: 120 },
    { menuId: "over", ingredientId: "pasta", quantity: 120 },
  ];
  const sales = [
    { menuId: "healthy", quantitySold: 100 }, // 貢献度 100*(1000-96)=90,400(こちらの方が大きい)
    { menuId: "over", quantitySold: 5 }, // 貢献度 5*(300-96)=1,020
  ];

  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(ranking[0].menuId, "over", "利益貢献度では負けていても、目標超過メニューが優先されるべき");
  assert.equal(ranking[1].menuId, "healthy");
});

test("優先度: 目標超過メニュー同士は、値上げした場合の月間効果(値上げ目安額×販売数量)が大きい順", () => {
  const menus = [
    { id: "small-impact", name: "少量メニュー", sellingPrice: 300, targetCostRate: 30 }, // 原価96円->32%
    { id: "big-impact", name: "大量メニュー", sellingPrice: 300, targetCostRate: 30 }, // 同じ原価率
  ];
  const menuIngredients = [
    { menuId: "small-impact", ingredientId: "pasta", quantity: 120 },
    { menuId: "big-impact", ingredientId: "pasta", quantity: 120 },
  ];
  const sales = [
    { menuId: "small-impact", quantitySold: 2 },
    { menuId: "big-impact", quantitySold: 200 }, // 販売数が多い分、値上げの月間効果が大きい
  ];

  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(ranking[0].menuId, "big-impact");
  assert.equal(ranking[1].menuId, "small-impact");
});

test("優先度: 目標超過メニューで販売数量が未登録(月間効果0円)同士は、原価率の超過幅が大きい順", () => {
  const menus = [
    { id: "slightly-over", name: "わずかに超過", sellingPrice: 300, targetCostRate: 30 }, // 96円->32%(+2pt)
    { id: "way-over", name: "大幅に超過", sellingPrice: 150, targetCostRate: 30 }, // 96円->64%(+34pt)
  ];
  const menuIngredients = [
    { menuId: "slightly-over", ingredientId: "pasta", quantity: 120 },
    { menuId: "way-over", ingredientId: "pasta", quantity: 120 },
  ];

  const ranking = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients,
    sales: [], // どちらも販売数量未登録 -> 月間効果は両方0円
    defaultTargetCostRate: 30,
  });
  assert.equal(ranking[0].menuId, "way-over");
  assert.equal(ranking[1].menuId, "slightly-over");
});

test("売価未設定のメニューは原価率・貢献度ともnullになり、ランキング末尾に回される", () => {
  const menus = [
    { id: "m1", name: "価格未設定", sellingPrice: null, targetCostRate: 30 },
    { id: "m2", name: "通常メニュー", sellingPrice: 900, targetCostRate: 30 },
  ];
  const menuIngredients = [
    { menuId: "m1", ingredientId: "pasta", quantity: 120 },
    { menuId: "m2", ingredientId: "pasta", quantity: 120 },
  ];
  const sales = [
    { menuId: "m1", quantitySold: 1000 }, // 数だけは多いが金額不明
    { menuId: "m2", quantitySold: 1 },
  ];
  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(ranking[0].menuId, "m2");
  assert.equal(ranking[1].menuId, "m1");
  assert.equal(ranking[1].profitContribution, null);
  assert.equal(ranking[1].costRate, null);
});

test("月間の利益への影響額: 食材が値上がりした分、マイナスの影響額になる", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 100 }];
  // pastaの現在単価は0.8円/g。1つ前は0.5円/gだったとする(=値上がりした)
  const ingredientsWithHistory = [
    { id: "pasta", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5, priceIsSet: true },
    { id: "ketchup", currentPurchasePrice: 0.5, priceIsSet: true },
  ];
  const sales = [{ menuId: "m1", quantitySold: 10 }];

  const [summary] = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: ingredientsWithHistory,
    sales,
    defaultTargetCostRate: 30,
  });
  // 従来原価: 0.5*100=50円、現在原価: 0.8*100=80円。差額-30円 × 10食 = -300円
  assert.equal(summary.monthlyProfitImpact, -300);
});

test("月間の利益への影響額: 食材が値下がりした分、プラスの影響額になる", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 100 }];
  // 現在0.5円/g、1つ前は0.8円/gだった(=値下がりした)
  const ingredientsWithHistory = [{ id: "pasta", currentPurchasePrice: 0.5, previousPurchasePrice: 0.8, priceIsSet: true }];
  const sales = [{ menuId: "m1", quantitySold: 10 }];

  const [summary] = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: ingredientsWithHistory,
    sales,
    defaultTargetCostRate: 30,
  });
  // 従来原価: 0.8*100=80円、現在原価: 0.5*100=50円。差額+30円 × 10食 = +300円
  assert.equal(summary.monthlyProfitImpact, 300);
});

test("月間の利益への影響額: 1つ前の単価が分からない食材は「変化なし」として扱い、影響額は0円になる", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 100 }];
  const sales = [{ menuId: "m1", quantitySold: 10 }];

  // previousPurchasePriceを渡さない(=一度も値上げ・値下げされていない食材)
  const [summary] = buildMenuRanking({ menus, menuIngredients, ingredients, sales, defaultTargetCostRate: 30 });
  assert.equal(summary.monthlyProfitImpact, 0);
});

test("月間の利益への影響額: 販売数量が未登録(0件)のメニューはnullにする(0円と誤解させない)", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 100 }];
  const ingredientsWithHistory = [{ id: "pasta", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5, priceIsSet: true }];

  const [summary] = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: ingredientsWithHistory,
    sales: [], // 販売数量未登録
    defaultTargetCostRate: 30,
  });
  assert.equal(summary.quantitySold, 0);
  assert.equal(summary.monthlyProfitImpact, null);
});

test("歩留まり率: 未指定の食材は従来通り(仕入単価そのまま)で原価を計算する", () => {
  const menus = [{ id: "m1", name: "ナポリタン", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "pasta", quantity: 120 }];
  // 歩留まり率を渡さない -> 0.8*120=96円のまま(既存の計算と完全一致することを確認)
  const [summary] = buildMenuRanking({ menus, menuIngredients, ingredients, sales: [], defaultTargetCostRate: 30 });
  assert.ok(Math.abs(summary.totalCost - 96) < 1e-9);
});

test("歩留まり率: 70%の食材は、仕入単価を0.7で割った実質単価で原価を計算する", () => {
  const menus = [{ id: "m1", name: "焼き魚定食", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "fish", quantity: 100 }];
  // 1尾800円(1000gあたり)の魚、歩留まり70% -> 実質単価800/0.7=約1142.86円/1000g
  const fishIngredients = [{ id: "fish", currentPurchasePrice: 0.8, yieldRatePercent: 70, priceIsSet: true }];
  const [summary] = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: fishIngredients,
    sales: [],
    defaultTargetCostRate: 30,
  });
  // 実質単価(0.8/0.7)×100g = 80/0.7 = 約114.29円
  assert.ok(Math.abs(summary.totalCost - 0.8 / 0.7 * 100) < 1e-6);
  assert.ok(Math.abs(summary.totalCost - 114.2857142857) < 1e-4);
});

test("歩留まり率: 月間影響額の計算でも、現在・1つ前どちらの単価にも同じ歩留まり率が適用される", () => {
  const menus = [{ id: "m1", name: "焼き魚定食", sellingPrice: 900, targetCostRate: 30 }];
  const menuIngredients = [{ menuId: "m1", ingredientId: "fish", quantity: 100 }];
  const sales = [{ menuId: "m1", quantitySold: 10 }];
  // 現在0.8円/g、1つ前0.5円/g、歩留まり50%
  const fishIngredients = [
    { id: "fish", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5, yieldRatePercent: 50, priceIsSet: true },
  ];
  const [summary] = buildMenuRanking({
    menus,
    menuIngredients,
    ingredients: fishIngredients,
    sales,
    defaultTargetCostRate: 30,
  });
  // 現在原価: (0.8/0.5)*100=160円、従来原価: (0.5/0.5)*100=100円。差額-60円×10食=-600円
  assert.ok(Math.abs(summary.totalCost - 160) < 1e-9);
  assert.ok(Math.abs(summary.monthlyProfitImpact! - -600) < 1e-6);
});

test("findPriceHeadroomMenus: 原価率が目標より10ポイント以上低いメニューだけを、差が大きい順に返す", () => {
  const summaries = [
    summary({ menuId: "m1", costRate: 15, targetCostRate: 30 }), // 差15 → 対象
    summary({ menuId: "m2", costRate: 25, targetCostRate: 30 }), // 差5 → 対象外
    summary({ menuId: "m3", costRate: 5, targetCostRate: 30 }), // 差25 → 対象(最大)
    summary({ menuId: "m4", costRate: null, targetCostRate: 30 }), // 原価率不明 → 対象外
  ];
  const result = findPriceHeadroomMenus(summaries);
  assert.deepEqual(
    result.map((s) => s.menuId),
    ["m3", "m1"],
  );
});

test("findPriceHeadroomMenus: ちょうどしきい値(10ポイント差)は対象に含む", () => {
  const summaries = [summary({ menuId: "m1", costRate: 20, targetCostRate: 30 })];
  const result = findPriceHeadroomMenus(summaries);
  assert.deepEqual(result.map((s) => s.menuId), ["m1"]);
});

test("findPriceHeadroomMenus: しきい値は引数で上書きできる", () => {
  const summaries = [summary({ menuId: "m1", costRate: 25, targetCostRate: 30 })]; // 差5
  assert.equal(findPriceHeadroomMenus(summaries, 10).length, 0);
  assert.equal(findPriceHeadroomMenus(summaries, 5).length, 1);
});

// ── 未計算のメニュー(単価未設定の食材を含む)を、超過判定・値上げ目安・並び順から外す(2026-10-21) ──
// 期待値はMahiroが手計算で検算済み。店舗の目標原価率30%、メニュー個別の目標なし(1-6・1-7を除く)。
// 利益 =(売価 − 原価)× 今月の販売数量。登録順は A → B → C → D → E。
//   A 生姜焼き 750円・原価282円(37.6%、超過)・80食 → 利益 37,440
//   B 唐揚げ   780円・原価224円(28.7%)・120食      → 利益 66,720
//   C 未計算 1,000円・分かる分だけで原価350円(0円扱いで35.0%)・50食(0円扱いの利益 32,500)
//   D 未計算 1,280円・分かる分だけで原価112円(0円扱いで8.75%)・100食(0円扱いの利益 116,800)
//   E 生ビール 480円・原価80円(16.7%)・180食        → 利益 72,000
// 並び順: ①目標超過 → ②目標内(利益の大きい順)→ ③未計算(末尾、登録順)。
// EがBより上なのは、利益がE 72,000 > B 66,720 のため。
function unsetExample(aTargetCostRate: number | null = null, withUnset = true) {
  const menus = [
    { id: "A", name: "A 生姜焼き", sellingPrice: 750, targetCostRate: aTargetCostRate },
    { id: "B", name: "B 唐揚げ", sellingPrice: 780, targetCostRate: null },
    ...(withUnset
      ? [
          { id: "C", name: "C 未計算", sellingPrice: 1000, targetCostRate: null },
          { id: "D", name: "D 未計算", sellingPrice: 1280, targetCostRate: null },
        ]
      : []),
    { id: "E", name: "E 生ビール", sellingPrice: 480, targetCostRate: null },
  ];
  const exampleIngredients = [
    { id: "a", currentPurchasePrice: 282, priceIsSet: true },
    { id: "b", currentPurchasePrice: 224, priceIsSet: true },
    { id: "c", currentPurchasePrice: 350, priceIsSet: true },
    { id: "d", currentPurchasePrice: 112, priceIsSet: true },
    { id: "e", currentPurchasePrice: 80, priceIsSet: true },
    { id: "unset", currentPurchasePrice: 0, priceIsSet: false },
  ];
  const menuIngredients = [
    { menuId: "A", ingredientId: "a", quantity: 1 },
    { menuId: "B", ingredientId: "b", quantity: 1 },
    { menuId: "C", ingredientId: "c", quantity: 1 },
    { menuId: "C", ingredientId: "unset", quantity: 1 },
    { menuId: "D", ingredientId: "d", quantity: 1 },
    { menuId: "D", ingredientId: "unset", quantity: 1 },
    { menuId: "E", ingredientId: "e", quantity: 1 },
  ];
  const sales = [
    { menuId: "A", quantitySold: 80 },
    { menuId: "B", quantitySold: 120 },
    { menuId: "C", quantitySold: 50 },
    { menuId: "D", quantitySold: 100 },
    { menuId: "E", quantitySold: 180 },
  ];
  const ranking = buildMenuRanking({ menus, menuIngredients, ingredients: exampleIngredients, sales, defaultTargetCostRate: 30 });
  return {
    ranking,
    order: ranking.map((s) => s.menuId).join(","),
    byId: (id: string) => ranking.find((s) => s.menuId === id)!,
    // メニュー一覧の上部の件数(menus/page.tsx: rows.filter((r) => r.overTarget).length)
    menuListCount: ranking.filter((s) => s.overTarget).length,
    // 今見直すべきメニューの上部の件数・ダッシュボードの「値上げ検討」(未計算を除いて数える)
    reviewCount: ranking.filter((s) => s.overTarget && !s.hasUnsetIngredient).length,
  };
}

test("1-1 今見直すべきメニューの並び順: A, E, B, C, D(目標超過 → 目標内の利益順 → 未計算は末尾の登録順)", () => {
  const r = unsetExample();
  assert.equal(r.order, "A,E,B,C,D");
  assert.equal(r.byId("E").profitContribution, 72000);
  assert.equal(r.byId("B").profitContribution, 66720);
});

test("1-2 C(未計算・分かる分だけで35%)は超過判定しない・値上げ目安も出さない", () => {
  const c = unsetExample().byId("C");
  assert.equal(c.overTarget, false);
  assert.equal(c.suggestedPriceIncrease, 0);
});

test("1-3 D(未計算・分かる分だけで8.75%)も超過なし・値上げ目安なし", () => {
  const d = unsetExample().byId("D");
  assert.equal(d.overTarget, false);
  assert.equal(d.suggestedPriceIncrease, 0);
});

test("1-4 メニュー一覧の上部の件数: 1品(Aのみ)", () => {
  assert.equal(unsetExample().menuListCount, 1);
});

test("1-5 今見直すべきメニューの上部の件数・ダッシュボードの値上げ検討: 1品(変わらない)", () => {
  assert.equal(unsetExample().reviewCount, 1);
});

test("1-6 Aの個別目標を40%にした場合の並び順: E, B, A, C, D", () => {
  // 直す前(実際の計算関数で確認)は C, D, E, B, A だった。
  // Cは0円扱いの原価率35.0% > 目標30%で「目標超過」として先頭に来て、Dは0円扱いの利益116,800円が
  // 目標内で最大だったため2番目に来ていた。
  // 直した後: Aは37.6% ≤ 個別目標40%で目標内になり、目標内は利益の順 E(72,000)> B(66,720)> A(37,440)。
  // 未計算のC・Dは末尾に登録順で並ぶ。
  const r = unsetExample(40);
  assert.equal(r.order, "E,B,A,C,D");
  assert.equal(r.byId("A").overTarget, false);
  assert.equal(r.byId("A").profitContribution, 37440);
});

test("1-7 1-6の件数: メニュー一覧・今見直すべきメニュー・ダッシュボードとも0品", () => {
  const r = unsetExample(40);
  assert.equal(r.menuListCount, 0);
  assert.equal(r.reviewCount, 0);
});

test("1-8 未計算のメニューがない場合の並び順: A, E, B(変わらない)", () => {
  assert.equal(unsetExample(null, false).order, "A,E,B");
});
