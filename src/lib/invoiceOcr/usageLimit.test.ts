import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OCR_ATTEMPT_LIMIT,
  OCR_USAGE_LIMIT,
  remainingOcrUses,
  OCR_MONTHLY_USE_LIMIT,
  OCR_MONTHLY_ATTEMPT_LIMIT,
  OCR_GLOBAL_DAILY_ATTEMPT_LIMIT,
  OCR_USER_DAILY_ATTEMPT_LIMIT,
  jstMonthKey,
  jstDayKey,
  ocrGateMessage,
} from "./usageLimit.ts";

// 納品書の読み取りの回数の上限(2026-10-27にモニター期間向けに見直し。Mahiro確認済みの値)。
// Q-1・Q-2と、断ったときの文言はここ。DBの数え方(Q-3〜Q-16)はマイグレーション0029を
// 使い捨てのPostgresで流して確かめる(ocrUsageSql.test.ts)。

test("値: 1アカウントの月の成功50回・月の試行100回、アプリ全体の1日の試行200回", () => {
  assert.equal(OCR_MONTHLY_USE_LIMIT, 50);
  assert.equal(OCR_MONTHLY_ATTEMPT_LIMIT, 100);
  assert.equal(OCR_GLOBAL_DAILY_ATTEMPT_LIMIT, 200);
  assert.equal(OCR_USER_DAILY_ATTEMPT_LIMIT, 20);
  assert.ok(OCR_MONTHLY_ATTEMPT_LIMIT > OCR_MONTHLY_USE_LIMIT);
});

test("Q-1 月の区切りは日本時間: 10/31 23:59(日本時間)は2026-10、11/1 0:00(日本時間)は2026-11", () => {
  assert.equal(jstMonthKey(new Date("2026-10-31T14:59:59Z")), "2026-10");
  assert.equal(jstMonthKey(new Date("2026-10-31T15:00:00Z")), "2026-11");
  assert.equal(jstMonthKey(new Date("2026-12-31T15:00:00Z")), "2027-01"); // 年をまたぐ
});

test("Q-2 日の区切りは日本時間の0時", () => {
  assert.equal(jstDayKey(new Date("2026-10-27T14:59:59Z")), "2026-10-27");
  assert.equal(jstDayKey(new Date("2026-10-27T15:00:00Z")), "2026-10-28");
});

test("残りの回数: 月50回から使った分を引く(マイナスにならない)", () => {
  assert.equal(remainingOcrUses(0, OCR_MONTHLY_USE_LIMIT), 50);
  assert.equal(remainingOcrUses(1, OCR_MONTHLY_USE_LIMIT), 49);
  assert.equal(remainingOcrUses(50, OCR_MONTHLY_USE_LIMIT), 0);
  assert.equal(remainingOcrUses(60, OCR_MONTHLY_USE_LIMIT), 0);
});

test("Q-4・Q-6・Q-7・Q-11 断ったときの日本語の案内", () => {
  assert.equal(ocrGateMessage("use_limit"), "今月の読み取りの回数の上限(50回)に達しました。来月1日に、回数が元に戻ります。");
  assert.equal(ocrGateMessage("attempt_limit"), "今月の読み取りの試行回数の上限に達しました。来月1日に、回数が元に戻ります。");
  assert.equal(ocrGateMessage("daily_user_limit"), "今日の読み取りの回数の上限(20回)に達しました。明日もう一度お試しください。");
  assert.equal(ocrGateMessage("global_limit"), "本日の読み取りの受付が上限に達しました。明日もう一度お試しください。");
  assert.equal(ocrGateMessage("unavailable"), "ただいま読み取りを使えません。時間をおいて、もう一度お試しください。");
});

// ── 旧い上限(累計3回・試行10回)。新しい関数に切り替えるまで、今の本番の画面が使う ──
test("旧: 累計3回・試行10回(切り替え後に消す)", () => {
  assert.equal(OCR_USAGE_LIMIT, 3);
  assert.equal(OCR_ATTEMPT_LIMIT, 10);
  assert.equal(remainingOcrUses(2), 1);
});


test("値が、マイグレーション0029の関数の中の値と同じ(片方だけ直す事故を防ぐ)", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync("supabase/migrations/0029_ocr_monthly_limits.sql", "utf8");
  const v = (name: string) => Number(sql.match(new RegExp(name + " constant integer := (\\d+);"))?.[1]);
  assert.equal(v("monthly_use_limit"), OCR_MONTHLY_USE_LIMIT);
  assert.equal(v("monthly_attempt_limit"), OCR_MONTHLY_ATTEMPT_LIMIT);
  assert.equal(v("user_daily_attempt_limit"), OCR_USER_DAILY_ATTEMPT_LIMIT);
  assert.equal(v("global_daily_attempt_limit"), OCR_GLOBAL_DAILY_ATTEMPT_LIMIT);
});
