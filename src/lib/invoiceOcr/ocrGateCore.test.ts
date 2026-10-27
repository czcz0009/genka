import { test } from "node:test";
import assert from "node:assert/strict";
import { beginOcrAttemptWith, completeOcrSuccessWith, cancelOcrAttemptWith, type RpcClient } from "./ocrGateCore.ts";

// 読み取りの回数の関数(マイグレーション0029)を呼ぶところ(2026-10-27)。期待値G-1〜G-7はMahiroが確認する。
// 合言葉(OCR_DB_TOKEN)はサーバーの中だけで使い、DBの関数の引数(POSTの本文)で渡す。ログやエラーの文言には出さない。

const TOKEN = "t".repeat(48);
function fakeClient(reply: { data?: unknown; error?: { message: string; code?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  };
  return { client, calls };
}

test("G-1 合言葉が設定されていない → DBを呼ばずに「使えません」(回数は数えない)", async () => {
  const { client, calls } = fakeClient({ data: { result: "ok", reservation: "r" } });
  assert.deepEqual(await beginOcrAttemptWith(client, undefined), { ok: false, reason: "unavailable" });
  assert.deepEqual(await beginOcrAttemptWith(client, ""), { ok: false, reason: "unavailable" });
  assert.equal(calls.length, 0);
});

test("G-2 受け付けた → 受付票の番号を返す。合言葉は関数の引数(本文)で渡す", async () => {
  const { client, calls } = fakeClient({ data: { result: "ok", reservation: "11111111-1111-1111-1111-111111111111" } });
  assert.deepEqual(await beginOcrAttemptWith(client, TOKEN), { ok: true, reservation: "11111111-1111-1111-1111-111111111111" });
  assert.deepEqual(calls, [{ fn: "begin_ocr_attempt_v2", args: { p_server_token: TOKEN } }]);
});

test("G-3 上限で断られた → その理由を返す(今月・試行・今日・全体)", async () => {
  for (const reason of ["use_limit", "attempt_limit", "daily_user_limit", "global_limit"]) {
    const { client } = fakeClient({ data: { result: reason } });
    assert.deepEqual(await beginOcrAttemptWith(client, TOKEN), { ok: false, reason });
  }
});

test("G-4 DBのエラー(合言葉が違う forbidden 等)・おかしな返事 → 「使えません」。エラーの文言に合言葉を含めない", async () => {
  for (const reply of [{ error: { message: "forbidden", code: "42501" } }, { data: null }, { data: { result: "ok" } }, { data: "x" }]) {
    const { client } = fakeClient(reply);
    const r = await beginOcrAttemptWith(client, TOKEN);
    assert.deepEqual(r, { ok: false, reason: "unavailable" });
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  }
});

test("G-5 成功を数える → その月の成功回数を返す。失敗・おかしな返事は null(画面は上限側に倒す)", async () => {
  const ok = fakeClient({ data: 7 });
  assert.equal(await completeOcrSuccessWith(ok.client, TOKEN, "r1"), 7);
  assert.deepEqual(ok.calls, [{ fn: "complete_ocr_success_v2", args: { p_server_token: TOKEN, p_reservation: "r1" } }]);
  assert.equal(await completeOcrSuccessWith(fakeClient({ error: { message: "x" } }).client, TOKEN, "r1"), null);
  assert.equal(await completeOcrSuccessWith(fakeClient({ data: 1 }).client, undefined, "r1"), null);
});

test("G-6 取り消す → 受付票と記録の種類を渡す。合言葉が無ければ何もしない", async () => {
  const c = fakeClient({ data: null });
  await cancelOcrAttemptWith(c.client, TOKEN, "r2", "credit");
  assert.deepEqual(c.calls, [{ fn: "cancel_ocr_attempt_v2", args: { p_server_token: TOKEN, p_reservation: "r2", p_incident: "credit" } }]);
  const n = fakeClient({ data: null });
  await cancelOcrAttemptWith(n.client, undefined, "r2", "credit");
  assert.equal(n.calls.length, 0);
});

test("G-7 DBの呼び出し自体が例外 → 「使えません」(画面を止めない)", async () => {
  const client: RpcClient = { rpc: async () => { throw new Error("network"); } };
  assert.deepEqual(await beginOcrAttemptWith(client, TOKEN), { ok: false, reason: "unavailable" });
  assert.equal(await completeOcrSuccessWith(client, TOKEN, "r"), null);
  await cancelOcrAttemptWith(client, TOKEN, "r", "busy");
});
