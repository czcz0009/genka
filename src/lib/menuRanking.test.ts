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
