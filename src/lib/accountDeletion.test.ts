import { test } from "node:test";
import assert from "node:assert/strict";
import { GRACE_PERIOD_DAYS, calcScheduledFor, daysRemaining } from "./accountDeletion.ts";

test("GRACE_PERIOD_DAYSは30日", () => {
  assert.equal(GRACE_PERIOD_DAYS, 30);
});

test("calcScheduledFor: 申請日時の30日後を返す", () => {
  const requestedAt = new Date("2026-09-01T00:00:00.000Z");
  const scheduledFor = calcScheduledFor(requestedAt);
  assert.equal(scheduledFor.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("calcScheduledFor: 猶予日数を変えられる", () => {
  const requestedAt = new Date("2026-09-01T00:00:00.000Z");
  const scheduledFor = calcScheduledFor(requestedAt, 7);
  assert.equal(scheduledFor.toISOString(), "2026-09-08T00:00:00.000Z");
});

test("daysRemaining: ちょうど30日前なら30日後と表示する", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const scheduledFor = calcScheduledFor(now);
  assert.equal(daysRemaining(scheduledFor, now), 30);
});

test("daysRemaining: 半端な時間は切り上げる(0.1日残りでも1日後)", () => {
  const now = new Date("2026-09-29T23:00:00.000Z");
  const scheduledFor = new Date("2026-09-30T00:00:00.000Z"); // 残り1時間
  assert.equal(daysRemaining(scheduledFor, now), 1);
});

test("daysRemaining: 期限を過ぎていれば0(マイナスにしない)", () => {
  const now = new Date("2026-10-05T00:00:00.000Z");
  const scheduledFor = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(daysRemaining(scheduledFor, now), 0);
});

test("daysRemaining: ちょうど期限ぴったりなら0", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(daysRemaining(now, now), 0);
});
