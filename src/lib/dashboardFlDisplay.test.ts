import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSalesAndFoodCost, calcFlRatios } from "./flRatio.ts";
import { buildDashboardFlKpi, buildDashboardFlDigestRow } from "./dashboardFlDisplay.ts";
import type { MenuCostSummary } from "./types.ts";

// ダッシュボードの「今月のFL比率」表示の期待値(2026-10-21、Mahiroが12件とも検算済み)。
// FL比率 =(食材原価 + 人件費)÷ 売上 × 100。売上には未計算メニューの分も含み、
// 食材原価は計算できたメニューの分だけ(FL比率の画面と同じ集計: aggregateSalesAndFoodCost)。

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

/**
 * 計算できたメニュー(売上computableSales・原価foodCost)と、単価未設定の食材を含むメニュー
 * (売上unsetSales、販売数量unsetQuantity)から、ダッシュボードと同じ経路でFL比率を出す。
 */
function dashboardFl(input: {
  computableSales: number;
  foodCost: number;
  laborCost: number | null;
  unsetSales?: number;
  unsetQuantity?: number;
}) {
  const summaries = [
    summary({
      menuId: "computed",
      sellingPrice: input.computableSales,
      totalCost: input.foodCost,
      quantitySold: input.computableSales > 0 ? 1 : 0,
    }),
  ];
  if (input.unsetSales != null) {
    summaries.push(
      summary({
        menuId: "unset",
        sellingPrice: input.unsetSales,
        totalCost: 0,
        quantitySold: input.unsetQuantity ?? 1,
        hasUnsetIngredient: true,
      }),
    );
  }
  const { totalSales, totalFoodCost, hasUnsetMenu } = aggregateSalesAndFoodCost(summaries);
  const { flRate } = calcFlRatios({ totalSales, totalFoodCost, laborCost: input.laborCost, rentCost: null, lossAmount: null });
  return { kpi: buildDashboardFlKpi(flRate, hasUnsetMenu), digest: buildDashboardFlDigestRow(flRate, hasUnsetMenu), hasUnsetMenu };
}

test("#1 全メニュー計算済み 55.0%: 緑、変わったことの行なし", () => {
  const r = dashboardFl({ computableSales: 100000, foodCost: 30000, laborCost: 25000 });
  assert.deepEqual(r.kpi, { text: "55.0%", tone: "ok", showCaution: false });
  assert.equal(r.digest, null);
});

test("#2 全メニュー計算済み 60.0%(境界): 60%ちょうどは目安内なので緑、行なし", () => {
  const r = dashboardFl({ computableSales: 100000, foodCost: 30000, laborCost: 30000 });
  assert.deepEqual(r.kpi, { text: "60.0%", tone: "ok", showCaution: false });
  assert.equal(r.digest, null);
});

test("#3 全メニュー計算済み 67.0%: 黄(以前のダッシュボードは65%超で赤だった)、行は黄", () => {
  const r = dashboardFl({ computableSales: 100000, foodCost: 37000, laborCost: 30000 });
  assert.deepEqual(r.kpi, { text: "67.0%", tone: "warn", showCaution: false });
  assert.deepEqual(r.digest, { status: "warn", description: "今月のFL比率 67.0%。人件費・食材原価の見直しを検討してください。" });
});

test("#4 全メニュー計算済み 70.0%(境界): 70%ちょうどは黄、行は黄", () => {
  const r = dashboardFl({ computableSales: 100000, foodCost: 40000, laborCost: 30000 });
  assert.deepEqual(r.kpi, { text: "70.0%", tone: "warn", showCaution: false });
  assert.deepEqual(r.digest, { status: "warn", description: "今月のFL比率 70.0%。人件費・食材原価の見直しを検討してください。" });
});

test("#5 全メニュー計算済み 75.0%: 赤、行は赤", () => {
  const r = dashboardFl({ computableSales: 100000, foodCost: 40000, laborCost: 35000 });
  assert.deepEqual(r.kpi, { text: "75.0%", tone: "danger", showCaution: false });
  assert.deepEqual(r.digest, { status: "danger", description: "今月のFL比率 75.0%。人件費・食材原価の見直しを検討してください。" });
});

test("#6 未計算あり 44.7%以上(実画面確認と同じデータ): 灰色・注意なし、行なし", () => {
  const r = dashboardFl({ computableSales: 283200, foodCost: 81040, laborCost: 60000, unsetSales: 32000 });
  assert.deepEqual(r.kpi, { text: "44.7%以上", tone: "muted", showCaution: false });
  assert.equal(r.digest, null);
});

test("#7 未計算あり 60.0%以上(境界): 60%ちょうどは目安を超えていないので注意なし、行なし", () => {
  const r = dashboardFl({ computableSales: 90000, foodCost: 30000, laborCost: 30000, unsetSales: 10000 });
  assert.deepEqual(r.kpi, { text: "60.0%以上", tone: "muted", showCaution: false });
  assert.equal(r.digest, null);
});

test("#8 未計算あり 62.0%以上: 灰色+注意、行は黄(以上・参考値の文言つき)", () => {
  const r = dashboardFl({ computableSales: 90000, foodCost: 32000, laborCost: 30000, unsetSales: 10000 });
  assert.deepEqual(r.kpi, { text: "62.0%以上", tone: "muted", showCaution: true });
  assert.deepEqual(r.digest, {
    status: "warn",
    description: "今月のFL比率 62.0%以上(未計算のメニューを含む参考値)。人件費・食材原価の見直しを検討してください。",
  });
});

test("#9 未計算あり 75.0%以上: 本来なら赤の水準でも、灰色+注意、行も黄(赤にしない)", () => {
  // 未計算を含む間は赤(危険)にしない理由: 未計算メニューの原価を0円として除いているため、
  // この値は「少なくともこれ以上」という下限でしかない。下限が目安を超えたことは確実なので
  // 「注意」は出すが、本当の値が分からないまま「危険」の段階を付けると、単価を設定した後の
  // 正しい値と段階の根拠がずれる。色分けは、全メニューが計算できたときだけ行う。
  // FL比率の画面も同じ扱い(FlRatioView.tsxの severity={hasUnsetMenu ? undefined : ...} と exceedsWarning)。
  const r = dashboardFl({ computableSales: 90000, foodCost: 40000, laborCost: 35000, unsetSales: 10000 });
  assert.deepEqual(r.kpi, { text: "75.0%以上", tone: "muted", showCaution: true });
  assert.deepEqual(r.digest, {
    status: "warn",
    description: "今月のFL比率 75.0%以上(未計算のメニューを含む参考値)。人件費・食材原価の見直しを検討してください。",
  });
});

test("#10 未計算メニューはあるが今月の販売数量が0: 以上を付けず、通常どおり緑", () => {
  // 販売数量0のメニューは今月の売上・原価に影響しないため、下限値扱いにしない。
  // FL比率の画面も同じ判断になること(aggregateSalesAndFoodCostのhasUnsetMenu)は flRatio.test.ts で確認している。
  const r = dashboardFl({ computableSales: 100000, foodCost: 30000, laborCost: 25000, unsetSales: 1280, unsetQuantity: 0 });
  assert.equal(r.hasUnsetMenu, false);
  assert.deepEqual(r.kpi, { text: "55.0%", tone: "ok", showCaution: false });
  assert.equal(r.digest, null);
});

test("#11 人件費が未入力: 「-」、色なし、行なし(未計算メニューの有無は問わない)", () => {
  for (const unsetSales of [undefined, 10000]) {
    const r = dashboardFl({ computableSales: 100000, foodCost: 30000, laborCost: null, unsetSales });
    assert.deepEqual(r.kpi, { text: "-", tone: null, showCaution: false });
    assert.equal(r.digest, null);
  }
});

test("#12 今月の売上が0: 「-」、色なし、行なし", () => {
  const r = dashboardFl({ computableSales: 0, foodCost: 0, laborCost: 30000 });
  assert.deepEqual(r.kpi, { text: "-", tone: null, showCaution: false });
  assert.equal(r.digest, null);
});
