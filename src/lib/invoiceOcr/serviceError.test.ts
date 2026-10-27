import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAiError } from "./serviceError.ts";

// AI(Anthropic)の呼び出しが失敗したときの分け方(2026-10-27。Q-11)。
// 「unavailable」(こちら側・AI側の都合: 残高不足・鍵・混雑・障害・通信)は、店主の回数を減らさず(試行を取り消す)、
//  「ただいま読み取りを使えません」を出し、残高不足などは記録に残す。
// 「content」(写真が読めない等、写真の側の問題)は、今までどおり試行1回として数える。

const apiError = (status: number, type: string, message: string) => Object.assign(new Error(message), { status, error: { type, error: { type, message } } });

test("Q-11 残高不足(400・『credit balance is too low』)→ unavailable・記録は credit", () => {
  const e = apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.");
  assert.deepEqual(classifyAiError(e), { kind: "unavailable", incident: "credit" });
});

test("Q-11 支払いの問題(402・billing_error)→ unavailable・記録は credit", () => {
  assert.deepEqual(classifyAiError(apiError(402, "billing_error", "billing issue")), { kind: "unavailable", incident: "credit" });
});

test("鍵が無効(401)・権限(403)→ unavailable・記録は auth", () => {
  assert.deepEqual(classifyAiError(apiError(401, "authentication_error", "invalid x-api-key")), { kind: "unavailable", incident: "auth" });
  assert.deepEqual(classifyAiError(apiError(403, "permission_error", "no")), { kind: "unavailable", incident: "auth" });
});

test("混雑(429・529)・AI側の障害(500台)・通信の失敗 → unavailable・記録は busy(多いときだけ気にする)", () => {
  assert.deepEqual(classifyAiError(apiError(429, "rate_limit_error", "slow down")), { kind: "unavailable", incident: "busy" });
  assert.deepEqual(classifyAiError(apiError(529, "overloaded_error", "Overloaded")), { kind: "unavailable", incident: "busy" });
  assert.deepEqual(classifyAiError(apiError(500, "api_error", "internal")), { kind: "unavailable", incident: "busy" });
  assert.deepEqual(classifyAiError(Object.assign(new Error("fetch failed"), { name: "APIConnectionError" })), { kind: "unavailable", incident: "busy" });
});

test("それ以外の400(画像が大きすぎる・形式の問題など)→ content(写真の側の問題。試行1回として数える)", () => {
  assert.deepEqual(classifyAiError(apiError(400, "invalid_request_error", "Could not process image")), { kind: "content", incident: null });
  assert.deepEqual(classifyAiError(apiError(413, "request_too_large", "too large")), { kind: "content", incident: null });
});

test("形の分からない例外 → unavailable・busy(回数を減らさない側に倒す)", () => {
  assert.deepEqual(classifyAiError("something"), { kind: "unavailable", incident: "busy" });
});
