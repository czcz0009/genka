import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSyuyoCsv, type SyuyoItem } from "./parseSyuyoCsv.ts";
import { matchIngredientsToItems } from "./matchIngredientToItem.ts";
import { buildIngredientOverview } from "./buildIngredientOverview.ts";

// 食材名と野菜・果物の品目の対応づけで、まちがった結びつきを防ぐ(2026-10-22、期待値M-1〜M-18はMahiroが確認済み)。
// 例: 「鶏もも肉」が果物の「もも(桃)」に、「いか」が「すいか」に推定で結びつき、追跡状況に桃の価格が出ていた。

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = parseSyuyoCsv(readFileSync(join(__dirname, "fixtures", "26073h_syuyo.csv"))).items;
const extra = (itemCode: string, itemName: string): SyuyoItem => ({
  itemCode,
  itemName,
  isBreakdownRow: false,
  wholesaleQuantityTon: null,
  wholesaleValueThousandYen: null,
  pricePerKg: 500,
  yoyQuantityPercent: null,
  yoyPricePercent: null,
  prevThirdQuantityPercent: null,
  prevThirdPricePercent: null,
});
// 7月下旬のファイルに無い(季節の)品目を足して、すべての品目がある状態で確かめる
const needed: [string, string][] = [
  ["44100", "もも"], ["43500", "かき計"], ["34700", "スイートコーン"], ["36200", "ばれいしょ"], ["50300", "パイナップル"],
  ["36700", "にんにく"], ["44800", "おうとう"], ["44950", "うめ"], ["35300", "実えんどう"], ["43000", "日本なし計"],
  ["48100", "すいか"], ["37200", "しょうが"], ["42000", "りんご計"], ["35100", "さやいんげん"], ["30400", "ごぼう"],
];
const items: SyuyoItem[] = [...fixture, ...needed.filter(([c]) => !fixture.some((i) => i.itemCode === c)).map(([c, n]) => extra(c, n))];

function match(name: string) {
  const [m] = matchIngredientsToItems([{ id: "i", name }], items);
  return m ? { itemCode: m.itemCode, confidence: m.confidence } : null;
}

test("M-1・M-2 肉の語(肉・鶏・豚・牛)を含む名前は、野菜・果物に推定で結びつけない", () => {
  for (const name of ["鶏もも肉", "鶏もも", "もも肉", "豚もも", "牛もも"]) assert.equal(match(name), null, name);
});

test("M-3 鶏むね肉・豚バラ・牛すじ・牛乳は、今までどおり結びつかない", () => {
  for (const name of ["鶏むね肉", "豚バラ", "牛すじ", "牛乳"]) assert.equal(match(name), null, name);
});

test("M-4 牛蒡は辞書との完全一致でごぼう(確定)。肉の語の除外は推定だけに効く", () => {
  assert.deepEqual(match("牛蒡"), { itemCode: "30400", confidence: "high" });
});

test("M-5 桃は桃(確定)のまま", () => {
  assert.deepEqual(match("桃"), { itemCode: "44100", confidence: "high" });
});

test("M-6〜M-8 いか・みりん・みょうが(とその書き方)は、推定の対象外(結びつかない)", () => {
  for (const name of ["いか", "イカ", "烏賊", "みりん", "味醂", "みょうが", "茗荷"]) assert.equal(match(name), null, name);
});

test("M-9 よく使う野菜・果物は、今までどおり確定で結びつく", () => {
  const expected: [string, string][] = [
    ["キャベツ", "31700"], ["玉ねぎ", "36610"], ["たまねぎ", "36610"], ["長ねぎ", "31900"], ["にんじん", "30300"], ["じゃがいも", "36200"],
    ["大根", "30100"], ["白菜", "31100"], ["ほうれん草", "31800"], ["小松菜", "31500"], ["ピーマン", "34500"], ["なす", "34300"],
    ["トマト", "34400"], ["きゅうり", "34100"], ["レタス", "33400"], ["かぼちゃ", "34200"], ["ごぼう", "30400"], ["生姜", "37200"],
    ["にんにく", "36700"], ["さつまいも", "36100"], ["里芋", "36300"], ["いんげん", "35100"], ["梨", "43000"],
  ];
  for (const [name, code] of expected) {
    const m = match(name);
    if (!items.some((i) => i.itemCode === code)) continue; // 7月下旬のファイルに無い品目は対象外
    assert.deepEqual(m, { itemCode: code, confidence: "high" }, name);
  }
});

test("M-10 すいか・しょうが・りんごは確定のまま", () => {
  assert.deepEqual(match("すいか"), { itemCode: "48100", confidence: "high" });
  assert.deepEqual(match("しょうが"), { itemCode: "37200", confidence: "high" });
  assert.deepEqual(match("りんご"), { itemCode: "42000", confidence: "high" });
});

test("M-11 もも・モモは、桃(推定)", () => {
  assert.deepEqual(match("もも"), { itemCode: "44100", confidence: "low" });
  assert.deepEqual(match("モモ"), { itemCode: "44100", confidence: "low" });
});

test("M-12 かき・カキは、柿(推定)(飲食店では牡蠣が多い)", () => {
  assert.deepEqual(match("かき"), { itemCode: "43500", confidence: "low" });
  assert.deepEqual(match("カキ"), { itemCode: "43500", confidence: "low" });
});

test("M-13 柿は、柿(確定)のまま", () => {
  assert.deepEqual(match("柿"), { itemCode: "43500", confidence: "high" });
});

test("M-16 白桃は、桃(確定)", () => {
  assert.deepEqual(match("白桃"), { itemCode: "44100", confidence: "high" });
});

test("M-17 加工品などを指すことが多い名前は推定に下げる(いんげん・梨は確定のまま)", () => {
  const expected: [string, string][] = [
    ["ポテト", "36200"], ["コーン", "34700"], ["パイン", "50300"], ["ガーリック", "36700"], ["チェリー", "44800"],
    ["うめ", "44950"], ["梅", "44950"], ["グリーンピース", "35300"], ["なし", "43000"],
  ];
  for (const [name, code] of expected) assert.deepEqual(match(name), { itemCode: code, confidence: "low" }, name);
  assert.deepEqual(match("いんげん"), { itemCode: "35100", confidence: "high" });
  assert.deepEqual(match("梨"), { itemCode: "43000", confidence: "high" });
});

// ── 追跡状況(アラート画面「登録食材の追跡状況」)の組み立て ──

const overviewBase = {
  produceCurrent: [extra("44100", "もも"), extra("34700", "スイートコーン")],
  producePrevious: [{ ...extra("44100", "もも"), pricePerKg: 400 }, { ...extra("34700", "スイートコーン"), pricePerKg: 400 }],
  livestockCandidateIds: [] as string[],
  livestockCurrent: [{ ...extra("chicken_thigh", "鶏肉もも 東京"), pricePerKg: 834 }],
  livestockPrevious: [{ ...extra("chicken_thigh", "鶏肉もも 東京"), pricePerKg: 832 }],
};

test("M-14 「鶏もも肉」を「鶏肉もも 東京」に紐づけ済み → 追跡状況は「鶏肉もも 東京」", () => {
  const ingredients = [{ id: "a", name: "鶏もも肉" }];
  const rows = buildIngredientOverview({
    ...overviewBase,
    ingredients,
    produceMatches: matchIngredientsToItems(ingredients, items),
    linkedLivestock: [{ id: "a", itemCode: "chicken_thigh", itemLabel: "鶏肉もも 東京" }],
  });
  assert.equal(rows[0].status, "tracked");
  assert.equal(rows[0].category, "livestock");
  assert.equal(rows[0].itemName, "鶏肉もも 東京");
});

test("M-18 「もも」を利用者が「鶏肉もも 東京」に紐づけた → 追跡状況は「鶏肉もも 東京」(桃の推定は出ない。利用者の紐づけが優先)", () => {
  const ingredients = [{ id: "a", name: "もも" }];
  const rows = buildIngredientOverview({
    ...overviewBase,
    ingredients,
    produceMatches: matchIngredientsToItems(ingredients, items), // 桃(推定)の結びつきがある状態
    linkedLivestock: [{ id: "a", itemCode: "chicken_thigh", itemLabel: "鶏肉もも 東京" }],
  });
  assert.equal(rows[0].status, "tracked");
  assert.equal(rows[0].itemName, "鶏肉もも 東京");
  assert.equal(rows[0].currentPricePerKg, 834);
});

test("M-15 推定の行は、相手の品目の価格と前回比を出さない(候補の名前だけ)", () => {
  const ingredients = [{ id: "a", name: "コーン" }];
  const rows = buildIngredientOverview({
    ...overviewBase,
    ingredients,
    produceMatches: matchIngredientsToItems(ingredients, [...items, ...overviewBase.produceCurrent]),
    linkedLivestock: [],
  });
  assert.equal(rows[0].status, "needsReview");
  assert.equal(rows[0].itemName, "スイートコーン");
  assert.equal(rows[0].currentPricePerKg, null);
  assert.equal(rows[0].changePercent, null);
  assert.equal(rows[0].direction, null);
});
