import { test } from "node:test";
import assert from "node:assert/strict";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import { matchIngredientsToItems } from "./matchIngredientToItem.ts";
import { detectPriceChanges } from "./detectPriceChanges.ts";
import { generateMarketPriceAlerts } from "./generateAlerts.ts";
import { buildIngredientOverview } from "./buildIngredientOverview.ts";
import { applyUserLinksToProduceMatches, countIngredientsNeedingReview, type UserMarketLink } from "./userMarketLinks.ts";

// 利用者が、野菜・果物の対応づけを「合っている」と確定させる/「比べない」にする(2026-10-22、期待値C-1〜C-14はMahiro確認済み)。
// 優先順: ①利用者が確定した紐づけ(食肉・野菜果物・比べない)→ ②辞書との完全一致(紛らわしい名前を除く)
//        → ③推定(アラートも価格も出さず、確認を促す)→ ④食肉らしければ規格の設定を促す/それ以外は追跡対象外。

const item = (itemCode: string, itemName: string, pricePerKg: number): SyuyoItem => ({
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
});

// 前の旬 → 今の旬: 桃 500→600(+20%)、キャベツ 100→150(+50%)、スイートコーン 200→300(+50%)
const previous = [item("44100", "もも", 500), item("31700", "キャベツ", 100), item("34700", "スイートコーン", 200)];
const current = [item("44100", "もも", 600), item("31700", "キャベツ", 150), item("34700", "スイートコーン", 300)];
const livestockPrevious = [item("chicken_thigh", "鶏肉もも 東京", 800)];
const livestockCurrent = [item("chicken_thigh", "鶏肉もも 東京", 960)]; // +20%

/** 1つの食材について、追跡状況の行と、アラートの件数を出す(画面と同じ部品をつなぐ) */
function scenario(name: string, links: UserMarketLink[], opts: { current?: SyuyoItem[] } = {}) {
  const cur = opts.current ?? current;
  const ingredients = [{ id: "a", name }];
  const auto = matchIngredientsToItems(ingredients, cur);
  const produceMatches = applyUserLinksToProduceMatches(auto, links, [...cur, ...previous]);
  const chikusan = links.filter((l) => l.source === "chikusan");
  const rows = buildIngredientOverview({
    ingredients,
    produceMatches,
    produceCurrent: cur,
    producePrevious: previous,
    linkedLivestock: chikusan.map((l) => ({ id: l.ingredientId, itemCode: l.itemCode!, itemLabel: "鶏肉もも 東京" })),
    livestockCandidateIds: [],
    livestockCurrent,
    livestockPrevious,
    userLinks: links,
  });
  const alertInputs = {
    ingredients: [{ id: "a", name, currentPurchasePrice: 1, priceIsSet: true }],
    menus: [{ id: "m", name: "メニュー", sellingPrice: 1000, targetCostRate: 30 }],
    menuIngredients: [{ menuId: "m", ingredientId: "a", quantity: 100 }],
    defaultTargetCostRate: 30,
  };
  const produceAlerts = generateMarketPriceAlerts({ ...alertInputs, priceChanges: detectPriceChanges(cur, previous), matches: produceMatches }).alerts;
  const livestockAlerts = chikusan.length
    ? generateMarketPriceAlerts({
        ...alertInputs,
        priceChanges: detectPriceChanges(livestockCurrent, livestockPrevious),
        matches: chikusan.map((l) => ({ ingredientId: l.ingredientId, ingredientName: name, itemCode: l.itemCode!, itemName: "鶏肉もも 東京", confidence: "high" as const, method: "exact" as const, score: 1 })),
      }).alerts
    : [];
  return { row: rows[0], rows, alertCount: produceAlerts.length + livestockAlerts.length, needsReviewCount: countIngredientsNeedingReview(rows) };
}

const syuyo = (itemCode: string): UserMarketLink => ({ ingredientId: "a", source: "syuyo", itemCode });
const excluded: UserMarketLink = { ingredientId: "a", source: "excluded", itemCode: null };
const chikusan: UserMarketLink = { ingredientId: "a", source: "chikusan", itemCode: "chicken_thigh" };

test("C-1 「もも」・紐づけなし・桃+20% → 追跡状況は「確認が必要」(価格・前回比なし)、アラートは出ない", () => {
  const r = scenario("もも", []);
  assert.equal(r.row.status, "needsReview");
  assert.equal(r.row.itemName, "もも");
  assert.equal(r.row.currentPricePerKg, null);
  assert.equal(r.row.changePercent, null);
  assert.equal(r.alertCount, 0);
});

test("C-2 「もも」を利用者が「桃で合っている」と確定 → 桃の価格と前回比(+20%)、アラートが出る", () => {
  const r = scenario("もも", [syuyo("44100")]);
  assert.equal(r.row.status, "tracked");
  assert.equal(r.row.userSetting, "confirmed");
  assert.equal(r.row.currentPricePerKg, 600);
  assert.equal(r.row.changePercent, 20);
  assert.equal(r.alertCount, 1);
});

test("C-3(=M-18) 「もも」を利用者が「鶏肉もも 東京」に紐づけ → 追跡状況は鶏肉もも、鶏肉ももの変動でアラート", () => {
  const r = scenario("もも", [chikusan]);
  assert.equal(r.row.status, "tracked");
  assert.equal(r.row.category, "livestock");
  assert.equal(r.row.itemName, "鶏肉もも 東京");
  assert.equal(r.alertCount, 1); // 鶏肉もも+20%。桃の推定からは出ない
});

test("C-4(=M-14) 「鶏もも肉」を「鶏肉もも 東京」に紐づけ → 追跡状況は鶏肉もも", () => {
  const r = scenario("鶏もも肉", [chikusan]);
  assert.equal(r.row.itemName, "鶏肉もも 東京");
  assert.equal(r.alertCount, 1);
});

test("C-5 「コーン缶」(スイートコーンの推定)を「比べない」 → 「比べない(設定済み)」、推定もアラートも出ない", () => {
  const r = scenario("コーン缶", [excluded]);
  assert.equal(r.row.status, "excluded");
  assert.equal(r.row.userSetting, "excluded");
  assert.equal(r.row.itemName, null);
  assert.equal(r.alertCount, 0);
});

test("C-6 辞書で確定の「キャベツ」を「比べない」 → 利用者の設定が辞書より優先、アラートは出ない(キャベツは+50%)", () => {
  const r = scenario("キャベツ", [excluded]);
  assert.equal(r.row.status, "excluded");
  assert.equal(r.alertCount, 0);
});

test("C-7 「千切りキャベツ」(キャベツの推定)を「キャベツで合っている」と確定 → キャベツの価格と前回比、アラートが出る", () => {
  const before = scenario("千切りキャベツ", []);
  assert.equal(before.row.status, "needsReview");
  assert.equal(before.alertCount, 0);
  const r = scenario("千切りキャベツ", [syuyo("31700")]);
  assert.equal(r.row.status, "tracked");
  assert.equal(r.row.itemName, "キャベツ");
  assert.equal(r.row.changePercent, 50);
  assert.equal(r.alertCount, 1);
});

test("C-8 確定した桃が、今の旬のファイルに載っていない(季節外) → 「桃」(確定)のまま、価格はなし、アラートは出ない", () => {
  const r = scenario("もも", [syuyo("44100")], { current: current.filter((i) => i.itemCode !== "44100") });
  assert.equal(r.row.status, "tracked");
  assert.equal(r.row.itemName, "もも");
  assert.equal(r.row.currentPricePerKg, null);
  assert.equal(r.alertCount, 0);
});

test("C-9 C-2の確定を取り消す(紐づけなし)→ 自動の判定(推定)に戻る", () => {
  assert.deepEqual(
    { status: scenario("もも", []).row.status, alerts: scenario("もも", []).alertCount },
    { status: "needsReview", alerts: 0 },
  );
});

test("C-10 1食材1つ: 野菜・果物の紐づけを食肉の紐づけに替えたあと(DBには食肉の行だけ)→ 食肉の紐づけだけが効く", () => {
  // DBの決まり(unique (ingredient_id))と、保存の上書き(onConflict: ingredient_id)で、行は1つだけになる
  const r = scenario("もも", [chikusan]);
  assert.equal(r.row.category, "livestock");
  assert.equal(r.alertCount, 1);
});

test("C-11 「比べない」を取り消す → 自動の判定に戻る(推定の名前なら推定、辞書の一致なら確定)", () => {
  assert.equal(scenario("コーン缶", []).row.status, "needsReview");
  assert.equal(scenario("キャベツ", []).row.status, "tracked");
});

test("C-12 アラートの件数に、推定の食材と「比べない」の食材は数えない", () => {
  assert.equal(scenario("もも", []).alertCount, 0); // 推定(桃+20%でも)
  assert.equal(scenario("キャベツ", [excluded]).alertCount, 0); // 比べない(キャベツ+50%でも)
  assert.equal(scenario("キャベツ", []).alertCount, 1); // 辞書で確定なら数える
});

test("C-13 「確認が必要な食材」の件数は、推定の食材だけを数える(確定・比べない・食肉の紐づけ済みは数えない)", () => {
  assert.equal(scenario("もも", []).needsReviewCount, 1);
  assert.equal(scenario("もも", [syuyo("44100")]).needsReviewCount, 0);
  assert.equal(scenario("もも", [excluded]).needsReviewCount, 0);
  assert.equal(scenario("もも", [chikusan]).needsReviewCount, 0);
  assert.equal(scenario("キャベツ", []).needsReviewCount, 0);
});

test("C-14 辞書で確定の「キャベツ」を「比べない」にした後、取り消す → 辞書の確定に戻る(価格と前回比、アラートあり)", () => {
  assert.equal(scenario("キャベツ", [excluded]).row.status, "excluded");
  const r = scenario("キャベツ", []);
  assert.equal(r.row.status, "tracked");
  assert.equal(r.row.userSetting, null);
  assert.equal(r.row.changePercent, 50);
  assert.equal(r.alertCount, 1);
});
