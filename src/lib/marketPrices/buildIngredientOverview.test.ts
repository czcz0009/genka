import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIngredientOverview } from "./buildIngredientOverview.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

function syuyoItem(itemCode: string, itemName: string, pricePerKg: number | null): SyuyoItem {
  return {
    itemCode,
    itemName,
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
  };
}

test("青果物: 確信度highで一致 → tracked、前回比+10%(100円→110円)を計算する", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-cabbage", name: "キャベツ" }],
    produceMatches: [
      {
        ingredientId: "ing-cabbage",
        ingredientName: "キャベツ",
        itemCode: "1",
        itemName: "キャベツ",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("1", "キャベツ", 110)],
    producePrevious: [syuyoItem("1", "キャベツ", 100)],
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.status, "tracked");
  assert.equal(row.category, "produce");
  assert.equal(row.currentPricePerKg, 110);
  assert.ok(Math.abs(row.changePercent! - 10) < 0.0001, `expected ~10, got ${row.changePercent}`);
  assert.equal(row.direction, "up");
});

test("青果物: 値下がり(100円→80円)は direction が down、変動率は負の値になる", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-onion", name: "たまねぎ" }],
    produceMatches: [
      {
        ingredientId: "ing-onion",
        ingredientName: "たまねぎ",
        itemCode: "2",
        itemName: "たまねぎ",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("2", "たまねぎ", 80)],
    producePrevious: [syuyoItem("2", "たまねぎ", 100)],
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.direction, "down");
  assert.ok(Math.abs(row.changePercent! - -20) < 0.0001, `expected -20, got ${row.changePercent}`);
});

test("青果物: 確信度lowの推測一致 → needsReview(価格は参考値として計算する)", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-x", name: "ばれいしょっぽい何か" }],
    produceMatches: [
      {
        ingredientId: "ing-x",
        ingredientName: "ばれいしょっぽい何か",
        itemCode: "3",
        itemName: "ばれいしょ",
        confidence: "low",
        method: "fuzzy",
        score: 0.6,
      },
    ],
    produceCurrent: [syuyoItem("3", "ばれいしょ", 150)],
    producePrevious: [syuyoItem("3", "ばれいしょ", 150)],
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.status, "needsReview");
  assert.equal(row.itemName, "ばれいしょ");
  assert.equal(row.currentPricePerKg, 150);
  assert.equal(row.direction, "flat");
});

test("畜産物: 規格確定済み → tracked、規格コードで前回比を計算する", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-beef", name: "牛肉" }],
    produceMatches: [],
    produceCurrent: [],
    producePrevious: [],
    linkedLivestock: [{ id: "ing-beef", itemCode: "beef_a5", itemLabel: "牛肉 和牛去勢A5 東京" }],
    livestockCandidateIds: [],
    livestockCurrent: [syuyoItem("beef_a5", "牛肉 和牛去勢A5 東京", 2000)],
    livestockPrevious: [syuyoItem("beef_a5", "牛肉 和牛去勢A5 東京", 1800)],
  });

  const row = rows[0];
  assert.equal(row.status, "tracked");
  assert.equal(row.category, "livestock");
  assert.equal(row.itemName, "牛肉 和牛去勢A5 東京");
  assert.equal(row.currentPricePerKg, 2000);
  // (2000-1800)/1800*100 = 11.111...
  assert.ok(Math.abs(row.changePercent! - 11.111) < 0.01, `expected ~11.11, got ${row.changePercent}`);
  assert.equal(row.direction, "up");
});

test("畜産物: 候補はあるが規格未確定 → needsSetup、価格は表示しない", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-pork", name: "豚肉" }],
    produceMatches: [],
    produceCurrent: [],
    producePrevious: [],
    linkedLivestock: [],
    livestockCandidateIds: ["ing-pork"],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.status, "needsSetup");
  assert.equal(row.category, "livestock");
  assert.equal(row.itemName, null);
  assert.equal(row.currentPricePerKg, null);
});

test("青果物・畜産物のいずれにも一致しない食材 → untracked", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-mystery", name: "自家製秘伝ダレ" }],
    produceMatches: [],
    produceCurrent: [],
    producePrevious: [],
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.status, "untracked");
  assert.equal(row.category, null);
  assert.equal(row.itemName, null);
  assert.equal(row.currentPricePerKg, null);
  assert.equal(row.changePercent, null);
});

test("前回データが無い(比較不可)場合は、現在価格は出すが変動率はnullにする", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-cabbage", name: "キャベツ" }],
    produceMatches: [
      {
        ingredientId: "ing-cabbage",
        ingredientName: "キャベツ",
        itemCode: "1",
        itemName: "キャベツ",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("1", "キャベツ", 110)],
    producePrevious: [], // まだ2期分揃っていない(初回収集直後 等)
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.status, "tracked");
  assert.equal(row.currentPricePerKg, 110);
  assert.equal(row.changePercent, null);
  assert.equal(row.direction, null);
});

test("前回価格が0円(異常値)の場合はゼロ除算を避け、変動率をnullにする", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-cabbage", name: "キャベツ" }],
    produceMatches: [
      {
        ingredientId: "ing-cabbage",
        ingredientName: "キャベツ",
        itemCode: "1",
        itemName: "キャベツ",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("1", "キャベツ", 110)],
    producePrevious: [syuyoItem("1", "キャベツ", 0)],
    linkedLivestock: [],
    livestockCandidateIds: [],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  const row = rows[0];
  assert.equal(row.changePercent, null);
  assert.equal(row.direction, null);
});

test("複数食材を渡すと、登録順のまま全件分の行を返す", () => {
  const rows = buildIngredientOverview({
    ingredients: [
      { id: "ing-cabbage", name: "キャベツ" },
      { id: "ing-mystery", name: "自家製秘伝ダレ" },
      { id: "ing-pork", name: "豚肉" },
    ],
    produceMatches: [
      {
        ingredientId: "ing-cabbage",
        ingredientName: "キャベツ",
        itemCode: "1",
        itemName: "キャベツ",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("1", "キャベツ", 110)],
    producePrevious: [syuyoItem("1", "キャベツ", 100)],
    linkedLivestock: [],
    livestockCandidateIds: ["ing-pork"],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.ingredientId),
    ["ing-cabbage", "ing-mystery", "ing-pork"],
  );
  assert.equal(rows[0].status, "tracked");
  assert.equal(rows[1].status, "untracked");
  assert.equal(rows[2].status, "needsSetup");
});

test("同じ食材が青果物としても畜産物候補としても該当しうる場合、青果物一致を優先する", () => {
  const rows = buildIngredientOverview({
    ingredients: [{ id: "ing-both", name: "何か" }],
    produceMatches: [
      {
        ingredientId: "ing-both",
        ingredientName: "何か",
        itemCode: "1",
        itemName: "品目A",
        confidence: "high",
        method: "exact",
        score: 1,
      },
    ],
    produceCurrent: [syuyoItem("1", "品目A", 100)],
    producePrevious: [],
    linkedLivestock: [],
    livestockCandidateIds: ["ing-both"],
    livestockCurrent: [],
    livestockPrevious: [],
  });

  assert.equal(rows[0].status, "tracked");
  assert.equal(rows[0].category, "produce");
});
