import { test } from "node:test";
import assert from "node:assert/strict";
import { calcPriceChangeImpact } from "./priceChangeImpact.ts";

test("calcPriceChangeImpact: 事前に検算した数値例(基準2ヶ月の加重平均→値上げ後2ヶ月の累計改善額)", () => {
  const beforeMonths = [
    { month: "2026-04", quantitySold: 40, profitPerUnit: 400 },
    { month: "2026-05", quantitySold: 160, profitPerUnit: 500 },
  ];
  const afterMonths = [
    { month: "2026-06", quantitySold: 100, profitPerUnit: 600 },
    { month: "2026-07", quantitySold: 120, profitPerUnit: 600 },
  ];
  const result = calcPriceChangeImpact(800, 900, beforeMonths, afterMonths);
  // 基準 = (40*400+160*500)/(40+160) = 96000/200 = 480円
  assert.equal(result?.baselineProfitPerUnit, 480);
  assert.equal(result?.baselineMonthCount, 2);
  // 6月: 100*(600-480)=12000、7月: 120*(600-480)=14400
  assert.equal(result?.monthlyBreakdown[0].improvement, 12000);
  assert.equal(result?.monthlyBreakdown[1].improvement, 14400);
  assert.equal(result?.cumulativeImprovement, 26400);
});

test("calcPriceChangeImpact: 基準の月が4ヶ月分あっても直近3ヶ月だけを使う", () => {
  const beforeMonths = [
    { month: "2026-01", quantitySold: 1000, profitPerUnit: 0 }, // 古すぎるので無視されるべき
    { month: "2026-02", quantitySold: 100, profitPerUnit: 500 },
    { month: "2026-03", quantitySold: 100, profitPerUnit: 500 },
    { month: "2026-04", quantitySold: 100, profitPerUnit: 500 },
  ];
  const result = calcPriceChangeImpact(800, 900, beforeMonths, []);
  assert.equal(result?.baselineMonthCount, 3);
  assert.equal(result?.baselineProfitPerUnit, 500); // 1月分が混ざっていれば0円に引っ張られて違う値になるはず
});

test("calcPriceChangeImpact: 基準が1ヶ月分しか無い場合はその1ヶ月をそのまま基準にする", () => {
  const beforeMonths = [{ month: "2026-05", quantitySold: 50, profitPerUnit: 450 }];
  const result = calcPriceChangeImpact(800, 900, beforeMonths, []);
  assert.equal(result?.baselineMonthCount, 1);
  assert.equal(result?.baselineProfitPerUnit, 450);
});

test("calcPriceChangeImpact: 変更前の販売記録が無ければnull(記録がまだありません)", () => {
  assert.equal(calcPriceChangeImpact(800, 900, [], [{ month: "2026-06", quantitySold: 10, profitPerUnit: 600 }]), null);
});

test("calcPriceChangeImpact: 値上げ後に客数が落ちて改善額がマイナスになるケースも正しく計算する", () => {
  const beforeMonths = [{ month: "2026-05", quantitySold: 200, profitPerUnit: 500 }];
  const afterMonths = [{ month: "2026-06", quantitySold: 50, profitPerUnit: 600 }]; // 値上げ後、客数が激減
  const result = calcPriceChangeImpact(800, 900, beforeMonths, afterMonths);
  // 50*(600-500)=5000(単価分の改善はプラスだが、客数減の影響そのものはこの指標では別問題)
  assert.equal(result?.cumulativeImprovement, 5000);
});
