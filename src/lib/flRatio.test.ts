import { test } from "node:test";
import assert from "node:assert/strict";
import { selectApplicableFixedCost, aggregateSalesAndFoodCost, calcFlRatios } from "./flRatio.ts";
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
    ...partial,
  };
}

test("selectApplicableFixedCost: 期間と重なる行のうち最新のperiod_startを採用する", () => {
  const costs = [
    { costType: "rent" as const, amount: 150000, periodStart: "2026-01-01", periodEnd: null },
    { costType: "rent" as const, amount: 180000, periodStart: "2026-07-01", periodEnd: null }, // 家賃改定
  ];
  const amount = selectApplicableFixedCost(costs, "rent", { start: "2026-08-01", end: "2026-08-31" });
  assert.equal(amount, 180000);
});

test("selectApplicableFixedCost: 改定前の期間には改定前の家賃を使う", () => {
  const costs = [
    { costType: "rent" as const, amount: 150000, periodStart: "2026-01-01", periodEnd: "2026-06-30" },
    { costType: "rent" as const, amount: 180000, periodStart: "2026-07-01", periodEnd: null },
  ];
  const amount = selectApplicableFixedCost(costs, "rent", { start: "2026-03-01", end: "2026-03-31" });
  assert.equal(amount, 150000);
});

test("selectApplicableFixedCost: 人件費は該当月ぴったりの行を拾う", () => {
  const costs = [
    { costType: "labor" as const, amount: 400000, periodStart: "2026-07-01", periodEnd: "2026-07-31" },
    { costType: "labor" as const, amount: 420000, periodStart: "2026-08-01", periodEnd: "2026-08-31" },
  ];
  const amount = selectApplicableFixedCost(costs, "labor", { start: "2026-08-01", end: "2026-08-31" });
  assert.equal(amount, 420000);
});

test("selectApplicableFixedCost: 該当なしはnull", () => {
  const amount = selectApplicableFixedCost([], "labor", { start: "2026-08-01", end: "2026-08-31" });
  assert.equal(amount, null);
});

test("aggregateSalesAndFoodCost: 売価×数量の合計と原価×数量の合計を集計する", () => {
  const summaries = [
    summary({ menuId: "m1", sellingPrice: 900, totalCost: 300, quantitySold: 10 }),
    summary({ menuId: "m2", sellingPrice: 1000, totalCost: 400, quantitySold: 5 }),
    summary({ menuId: "m3", sellingPrice: null, totalCost: 200, quantitySold: 100 }), // 売価未設定は除外
  ];
  const { totalSales, totalFoodCost } = aggregateSalesAndFoodCost(summaries);
  assert.equal(totalSales, 900 * 10 + 1000 * 5);
  assert.equal(totalFoodCost, 300 * 10 + 400 * 5);
});

test("calcFlRatios: F比率・L比率・FL比率を個別に算出する", () => {
  const result = calcFlRatios({ totalSales: 1000000, totalFoodCost: 300000, laborCost: 300000, rentCost: null });
  assert.equal(result.foodCostRate, 30);
  assert.equal(result.laborCostRate, 30);
  assert.equal(result.flRate, 60);
  assert.equal(result.flrRate, null); // 家賃未登録
  assert.equal(result.flSeverity, "normal"); // ちょうど60%(目安以下)
});

test("calcFlRatios: 家賃が登録されていればFLR比率も算出する", () => {
  const result = calcFlRatios({
    totalSales: 1000000,
    totalFoodCost: 300000,
    laborCost: 300000,
    rentCost: 100000,
  });
  assert.equal(result.flrRate, 70);
  assert.equal(result.flrSeverity, "normal"); // ちょうど70%(目安以下)
});

test("calcFlRatios: 目安超過は「注意」、大きく超えると「危険」になる", () => {
  const caution = calcFlRatios({ totalSales: 1000000, totalFoodCost: 350000, laborCost: 320000, rentCost: null });
  assert.equal(caution.flRate, 67); // 60%より上、70%以下
  assert.equal(caution.flSeverity, "caution");

  const danger = calcFlRatios({ totalSales: 1000000, totalFoodCost: 400000, laborCost: 400000, rentCost: null });
  assert.equal(danger.flRate, 80); // 60+10=70を超える
  assert.equal(danger.flSeverity, "danger");
});

test("calcFlRatios: 人件費が未登録ならFL比率もnull(F比率だけは出す)", () => {
  const result = calcFlRatios({ totalSales: 1000000, totalFoodCost: 300000, laborCost: null, rentCost: null });
  assert.equal(result.foodCostRate, 30);
  assert.equal(result.flRate, null);
  assert.equal(result.flSeverity, null);
});

test("calcFlRatios: 売上0以下は全項目null(0除算を避ける)", () => {
  const result = calcFlRatios({ totalSales: 0, totalFoodCost: 100, laborCost: 100, rentCost: 100 });
  assert.equal(result.foodCostRate, null);
  assert.equal(result.flRate, null);
  assert.equal(result.flrRate, null);
});
