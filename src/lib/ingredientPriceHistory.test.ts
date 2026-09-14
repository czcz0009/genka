import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHistoricalPrice, type PriceHistoryEntry } from "./ingredientPriceHistory.ts";

test("resolveHistoricalPrice: 履歴が1件もない食材は現在の仕入単価にフォールバックする", () => {
  const history: PriceHistoryEntry[] = [];
  const price = resolveHistoricalPrice(history, "ing-1", "2026-07-31", 500);
  assert.equal(price, 500);
});

test("resolveHistoricalPrice: 対象月の末日より前に記録された価格を使う(値上がり後に過去月を見ても遡及して再計算されない)", () => {
  // 4月に400円→7月に値上がりして600円になった食材。今(9月)現在の単価は600円。
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 400, recordedAt: "2026-04-01T00:00:00.000Z" },
    { ingredientId: "ing-1", price: 600, recordedAt: "2026-07-15T00:00:00.000Z" },
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
    { ingredientId: "ing-1", price: 300, recordedAt: "2026-05-01T00:00:00.000Z" },
    // 5/31の23時に値上がり(月末ぎりぎり)
    { ingredientId: "ing-1", price: 350, recordedAt: "2026-05-31T23:00:00.000Z" },
  ];
  const mayPrice = resolveHistoricalPrice(history, "ing-1", "2026-05-31", 350);
  assert.equal(mayPrice, 350);
});

test("resolveHistoricalPrice: 対象月より後に記録された価格変更は無視する(未来の値上がりを過去に反映しない)", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 200, recordedAt: "2026-01-01T00:00:00.000Z" },
    // 9月に値上がり予定(まだ先の話)
    { ingredientId: "ing-1", price: 999, recordedAt: "2026-09-01T00:00:00.000Z" },
  ];
  const julyPrice = resolveHistoricalPrice(history, "ing-1", "2026-07-31", 999);
  assert.equal(julyPrice, 200);
});

test("resolveHistoricalPrice: 他の食材の履歴を混同しない", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 100, recordedAt: "2026-01-01T00:00:00.000Z" },
    { ingredientId: "ing-2", price: 9999, recordedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const price = resolveHistoricalPrice(history, "ing-1", "2026-06-30", 100);
  assert.equal(price, 100);
});

test("resolveHistoricalPrice: 複数回価格が変わっていても、対象月末時点で一番新しいものを選ぶ", () => {
  const history: PriceHistoryEntry[] = [
    { ingredientId: "ing-1", price: 100, recordedAt: "2026-01-01T00:00:00.000Z" },
    { ingredientId: "ing-1", price: 150, recordedAt: "2026-03-01T00:00:00.000Z" },
    { ingredientId: "ing-1", price: 120, recordedAt: "2026-05-01T00:00:00.000Z" },
  ];
  // 6月末時点では、直近の変更(5/1の120円)が有効
  const price = resolveHistoricalPrice(history, "ing-1", "2026-06-30", 120);
  assert.equal(price, 120);
  // 2月末時点では、1/1の100円のまま(3/1の150円はまだ先)
  const febPrice = resolveHistoricalPrice(history, "ing-1", "2026-02-28", 120);
  assert.equal(febPrice, 100);
});
