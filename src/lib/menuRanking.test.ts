import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuRanking } from "./menuRanking.ts";

const ingredients = [
  { id: "pasta", currentPurchasePrice: 0.8 }, // 円/g
  { id: "ketchup", currentPurchasePrice: 0.5 },
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
    { id: "pasta", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5 },
    { id: "ketchup", currentPurchasePrice: 0.5 },
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
  const ingredientsWithHistory = [{ id: "pasta", currentPurchasePrice: 0.5, previousPurchasePrice: 0.8 }];
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
  const ingredientsWithHistory = [{ id: "pasta", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5 }];

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
  const fishIngredients = [{ id: "fish", currentPurchasePrice: 0.8, yieldRatePercent: 70 }];
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
    { id: "fish", currentPurchasePrice: 0.8, previousPurchasePrice: 0.5, yieldRatePercent: 50 },
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
