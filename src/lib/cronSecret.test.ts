import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesCronSecret } from "./cronSecret.ts";

const isAuthorizedCronRequest = (r: Request) => matchesCronSecret(r.headers.get("authorization"), process.env.CRON_SECRET);

// 定期処理の入口の合言葉の確認(2026-10-27。点検の4・14番)。時間差で推測されにくい比べ方にする。
// 期待値C-1〜C-7はMahiroが確認する。

const SECRET = "x".repeat(24) + "Y".repeat(24); // 48文字(テスト用の値。本番の値ではない)
const req = (auth?: string) => new Request("https://example.com/api/cron/x", { headers: auth == null ? {} : { authorization: auth } });

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.CRON_SECRET;
  if (value == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
  try {
    return fn();
  } finally {
    if (before == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
}

test("C-1 正しい合言葉(Bearer 付き)は通す", () => {
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req(`Bearer ${SECRET}`))), true);
});

test("C-2 長さが同じで1文字だけ違う合言葉は通さない", () => {
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req(`Bearer ${SECRET.slice(0, -1)}Z`))), false);
});

test("C-3 長さが違う合言葉(短い・長い)は通さない(例外にもならない)", () => {
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req("Bearer abc"))), false);
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req(`Bearer ${SECRET}extra`))), false);
});

test("C-4 合言葉の欄が無い・空は通さない", () => {
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req())), false);
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req(""))), false);
});

test("C-5 「Bearer 」が付いていない(合言葉だけ)は通さない", () => {
  assert.equal(withSecret(SECRET, () => isAuthorizedCronRequest(req(SECRET))), false);
});

test("C-6 本番に合言葉が設定されていない(空・未設定)ときは、何が来ても通さない", () => {
  assert.equal(withSecret(undefined, () => isAuthorizedCronRequest(req("Bearer undefined"))), false);
  assert.equal(withSecret("", () => isAuthorizedCronRequest(req("Bearer "))), false);
});

test("C-7 合言葉が32文字より短い設定は、正しくても通さない(弱い合言葉を使わせない)", () => {
  const short = "a".repeat(31);
  assert.equal(withSecret(short, () => isAuthorizedCronRequest(req(`Bearer ${short}`))), false);
  const ok32 = "b".repeat(32);
  assert.equal(withSecret(ok32, () => isAuthorizedCronRequest(req(`Bearer ${ok32}`))), true);
});
