import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHistoricalPrice, resolveHistoricalPriceIsSet, type PriceHistoryEntry } from "./ingredientPriceHistory.ts";

test("resolveHistoricalPrice: 履歴が1件もない食材は現在の仕入単価にフォールバックする", () => {
  const history: PriceHistoryEntry[] = [];
  const price = resolveHistoricalPrice(history, "ing-1", "2026-07-31", 500);
  assert.equal(price, 500);
});

test("resolveHistoricalPrice: 対象月の末日より前に記録された価格を使う(値上がり後に過去月を見ても遡及して再計算されない)", () => {
  // 4月に400円→7月に値上がりして600円になった食材。今(9月)現在の単価は600円。
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 400, recordedAt: "2026-04-01T00:00:00.000Z", priceIsSet: true },
    { ingredientId: "ing-1", price: 600, recordedAt: "2026-07-15T00:00:00.000Z", priceIsSet: true },
  ];
  // 6月分を見る場合: 6月末時点ではまだ400円だったはず
  const junePrice = resolveHistoricalPrice(history, "ing-1", "2026-06-30", 600);
  assert.equal(junePrice, 400);
  // 8月分を見る場合: 7/15の値上がり後なので600円
  const augPrice = resolveHistoricalPrice(history, "ing-1", "2026-08-31", 600);
  assert.equal(augPrice, 600);
});

test("resolveHistoricalPrice: 月末当日に記録された価格変更も、その月の実績としてカウントする", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 300, recordedAt: "2026-05-01T00:00:00.000Z", priceIsSet: true },
    // 5/31の23時に値上がり(月末ぎりぎり)
    { ingredientId: "ing-1", price: 350, recordedAt: "2026-05-31T23:00:00.000Z", priceIsSet: true },
  ];
  const mayPrice = resolveHistoricalPrice(history, "ing-1", "2026-05-31", 350);
  assert.equal(mayPrice, 350);
});

test("resolveHistoricalPrice: 対象月より後に記録された価格変更は無視する(未来の値上がりを過去に反映しない)", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 200, recordedAt: "2026-01-01T00:00:00.000Z", priceIsSet: true },
    // 9月に値上がり予定(まだ先の話)
    { ingredientId: "ing-1", price: 999, recordedAt: "2026-09-01T00:00:00.000Z", priceIsSet: true },
  ];
  const julyPrice = resolveHistoricalPrice(history, "ing-1", "2026-07-31", 999);
  assert.equal(julyPrice, 200);
});

test("resolveHistoricalPrice: 他の食材の履歴を混同しない", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 100, recordedAt: "2026-01-01T00:00:00.000Z", priceIsSet: true },
    { ingredientId: "ing-2", price: 9999, recordedAt: "2026-01-01T00:00:00.000Z", priceIsSet: true },
  ];
  const price = resolveHistoricalPrice(history, "ing-1", "2026-06-30", 100);
  assert.equal(price, 100);
});

test("resolveHistoricalPrice: 複数回価格が変わっていても、対象月末時点で一番新しいものを選ぶ", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 100, recordedAt: "2026-01-01T00:00:00.000Z", priceIsSet: true },
    { ingredientId: "ing-1", price: 150, recordedAt: "2026-03-01T00:00:00.000Z", priceIsSet: true },
    { ingredientId: "ing-1", price: 120, recordedAt: "2026-05-01T00:00:00.000Z", priceIsSet: true },
  ];
  // 6月末時点では、直近の変更(5/1の120円)が有効
  const price = resolveHistoricalPrice(history, "ing-1", "2026-06-30", 120);
  assert.equal(price, 120);
  // 2月末時点では、1/1の100円のまま(3/1の150円はまだ先)
  const febPrice = resolveHistoricalPrice(history, "ing-1", "2026-02-28", 120);
  assert.equal(febPrice, 100);
});

// ここから、単価が「未設定」だった時期を過去月に正しく再現できるかのテスト(L・M)。
// 「当時は未設定」と判定するのは、履歴にpriceIsSet=falseが明示的に記録されている
// 場合だけにする(履歴が1件も無い場合は、今までの数値フォールバックの挙動に
// 合わせて「未設定とは判定しない」)。

test("L: 履歴が1件も無い月(食材の登録前)は、未設定とは判定しない(現状維持)", () => {
  // 2026年9月に初めて登録された食材(price_is_set=true・150円)。
  const history: PriceHistoryEntry[] = [
    { ingredientId: "sauce", price: 150, recordedAt: "2026-09-01T00:00:00.000Z", priceIsSet: true },
  ];
  // 登録前の6月には履歴が無い
  assert.equal(resolveHistoricalPriceIsSet(history, "sauce", "2026-06-30"), true);
  assert.equal(resolveHistoricalPrice(history, "sauce", "2026-06-30", 150), 150); // 現在価格にフォールバック(既存の挙動)
});

test("M: 未設定→後日設定、という変化があっても、設定される前の月は未設定のまま表示される", () => {
  // 「一味」は7月に未設定のまま登録され、9月に150円へ更新された。
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ichimi", price: 0, recordedAt: "2026-07-01T00:00:00.000Z", priceIsSet: false },
    { ingredientId: "ichimi", price: 150, recordedAt: "2026-09-01T00:00:00.000Z", priceIsSet: true },
  ];
  // 7月: 未設定
  assert.equal(resolveHistoricalPriceIsSet(history, "ichimi", "2026-07-31"), false);
  // 8月: 7月の記録がまだ最新のまま → 未設定
  assert.equal(resolveHistoricalPriceIsSet(history, "ichimi", "2026-08-31"), false);
  // 9月: 150円に更新された後 → 設定済み
  assert.equal(resolveHistoricalPriceIsSet(history, "ichimi", "2026-09-30"), true);
  assert.equal(resolveHistoricalPrice(history, "ichimi", "2026-09-30", 150), 150);
});
