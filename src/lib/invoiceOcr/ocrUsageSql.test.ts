import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// マイグレーション0029(読み取りの回数の上限の見直し)を、使い捨てのPostgres(pglite)に0001〜0029を流して確かめる(2026-10-27)。
// 期待値Q-3〜Q-11はMahiroが確認する。Supabaseの auth.uid() と、利用者の権限(authenticated)の決まりをまねている。

const MIG = join(process.cwd(), "supabase", "migrations");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
let db: PGlite;

async function setClock(jst: string) {
  await db.exec(`create or replace function public.ocr_jst_now() returns timestamp language sql stable as $$ select '${jst}'::timestamp $$;`);
}
/** 利用者として関数を呼ぶ(auth.uid() がその人になる) */
async function as<T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
const TOKEN = "test-server-token-0123456789abcdef0123456789";
const begin = async (uid: string, token: string | null = TOKEN) =>
  (await as<{ r: { result: string; reservation?: string } }>(uid, `select public.begin_ocr_attempt_v2(${token == null ? "null" : `'${token}'`}) as r`))[0].r;
const complete = async (uid: string, res: string, token: string = TOKEN) => (await as<{ n: number | null }>(uid, `select public.complete_ocr_success_v2('${token}', '${res}') as n`))[0].n;
const cancel = async (uid: string, res: string, kind: string, token: string = TOKEN) => as(uid, `select public.cancel_ocr_attempt_v2('${token}', '${res}', '${kind}')`);
const monthly = async (uid: string, month: string) =>
  (await db.query<{ used_count: number; attempt_count: number }>(`select used_count, attempt_count from ocr_usage_monthly where user_id = '${uid}' and month = '${month}'`)).rows[0] ?? null;
const daily = async (day: string) => (await db.query<{ attempt_count: number }>(`select attempt_count from ocr_usage_daily_total where day = '${day}'`)).rows[0]?.attempt_count ?? 0;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of files) await db.exec(readFileSync(join(MIG, f), "utf8").replace(/create extension if not exists "pgcrypto";/, ""));
  // アプリのサーバーだけが知る合言葉(DBには、その要約(SHA-256)だけを置く)
  await db.exec(`insert into app_server_tokens (name, token_sha256) values ('ocr', sha256(convert_to('${TOKEN}', 'UTF8')))`);
  await db.exec(`insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com'), ('${C}', 'c@example.com');`);
});

test("0029は二度実行しても同じ形になる(エラーにならない)・migration_logに0029が入る", async () => {
  await db.exec(readFileSync(join(MIG, "0029_ocr_monthly_limits.sql"), "utf8"));
  const r = await db.query<{ n: number }>("select count(*)::int as n from migration_log where version = '0029'");
  assert.equal(r.rows[0].n, 1);
});

test("Q-3 初めての利用: 受け付けて、成功すると今月の成功1回・試行1回", async () => {
  await setClock("2026-10-27 12:00");
  const r = await begin(A);
  assert.equal(r.result, "ok");
  assert.match(r.reservation!, /^[0-9a-f-]{36}$/);
  assert.equal(await complete(A, r.reservation!), 1);
  assert.deepEqual(await monthly(A, "2026-10"), { used_count: 1, attempt_count: 1 });
  assert.equal(await complete(A, r.reservation!), null); // 同じ受付票で二度は数えない
});

test("Q-4・Q-10 今月50回成功した後は「今月の上限」。断ったときは回数も受付票も増えない", async () => {
  await db.exec(`update ocr_usage_monthly set used_count = 50, attempt_count = 60 where user_id = '${A}' and month = '2026-10'`);
  const before = await db.query<{ n: number }>("select count(*)::int as n from ocr_attempt_reservations");
  const dayBefore = await daily("2026-10-27");
  assert.equal((await begin(A)).result, "use_limit");
  assert.deepEqual(await monthly(A, "2026-10"), { used_count: 50, attempt_count: 60 });
  assert.equal(await daily("2026-10-27"), dayBefore);
  const after = await db.query<{ n: number }>("select count(*)::int as n from ocr_attempt_reservations");
  assert.equal(after.rows[0].n, before.rows[0].n);
});

test("Q-5 前の月に50回使っていても、月が変わる(日本時間の11/1 0:00)と読み取れる", async () => {
  await setClock("2026-10-31 23:59:59");
  assert.equal((await begin(A)).result, "use_limit");
  await setClock("2026-11-01 00:00:00");
  const r = await begin(A);
  assert.equal(r.result, "ok");
  assert.deepEqual(await monthly(A, "2026-11"), { used_count: 0, attempt_count: 1 });
});

test("Q-6 成功0回でも、今月の試行100回で「試行の上限」", async () => {
  await setClock("2026-11-02 10:00");
  await db.exec(`insert into ocr_usage_monthly (user_id, month, used_count, attempt_count) values ('${B}', '2026-11', 0, 100)`);
  assert.equal((await begin(B)).result, "attempt_limit");
});

test("Q-7・Q-10 アプリ全体で今日200回の後は、初めての人でも「本日の受付の上限」。その人の回数は増えない", async () => {
  await setClock("2026-11-03 09:00");
  await db.exec(`insert into ocr_usage_daily_total (day, attempt_count) values ('2026-11-03', 200)`);
  assert.equal((await begin(C)).result, "global_limit");
  assert.deepEqual(await monthly(C, "2026-11"), { used_count: 0, attempt_count: 0 });
  assert.equal(await daily("2026-11-03"), 200);
});

test("Q-8 前の日に全体で200回でも、日本時間の0時を過ぎれば読み取れる", async () => {
  await setClock("2026-11-04 00:00:00");
  assert.equal((await begin(C)).result, "ok");
  assert.equal(await daily("2026-11-04"), 1);
});

test("Q-9 利用者の権限: 全体の回数・受付票・記録の表は読めない。自分の月の回数は読めるが、書き換えられない。他人の分は見えない", async () => {
  const denied = async (sql: string) => {
    try {
      await as(A, sql);
      return false;
    } catch (e) {
      return /permission denied/.test(String((e as Error).message));
    }
  };
  assert.ok(await denied("select * from ocr_usage_daily_total"));
  assert.ok(await denied("select * from ocr_attempt_reservations"));
  assert.ok(await denied("select * from ocr_service_incidents"));
  assert.ok(await denied(`update ocr_usage_monthly set used_count = 0 where user_id = '${A}'`));
  assert.ok(await denied(`insert into ocr_usage_monthly (user_id, month) values ('${A}', '2099-01')`));
  const mine = await as<{ user_id: string }>(A, "select user_id from ocr_usage_monthly");
  assert.ok(mine.length >= 1 && mine.every((r) => r.user_id === A));
});

test("Q-11 残高不足などAI側の都合で失敗 → 試行を取り消し(本人・全体とも元に戻る)、記録が1件残る。同じ受付票・他人からの取り消しは効かない", async () => {
  await setClock("2026-11-05 10:00");
  const r = await begin(A);
  assert.equal(r.result, "ok");
  const m1 = await monthly(A, "2026-11");
  const d1 = await daily("2026-11-05");
  await cancel(B, r.reservation!, "credit"); // 他人の受付票は取り消せない
  assert.deepEqual(await monthly(A, "2026-11"), m1);
  await cancel(A, r.reservation!, "credit");
  assert.deepEqual(await monthly(A, "2026-11"), { used_count: m1!.used_count, attempt_count: m1!.attempt_count - 1 });
  assert.equal(await daily("2026-11-05"), d1 - 1);
  await cancel(A, r.reservation!, "credit"); // 二度目は何もしない
  assert.equal(await daily("2026-11-05"), d1 - 1);
  assert.equal(await complete(A, r.reservation!), null); // 取り消した受付票は成功にならない
  const inc = await db.query<{ kind: string }>("select kind from ocr_service_incidents");
  assert.deepEqual(inc.rows.map((x) => x.kind), ["credit"]);
  // 10分以内の同じ種類は、記録を増やさない
  const r2 = await begin(A);
  await cancel(A, r2.reservation!, "credit");
  assert.equal((await db.query("select * from ocr_service_incidents")).rows.length, 1);
});

test("受付票の番号を知らなければ、成功を数えたり取り消したりできない(でたらめな番号は何もしない)", async () => {
  assert.equal(await complete(A, "11111111-1111-1111-1111-111111111111"), null);
  await cancel(A, "11111111-1111-1111-1111-111111111111", "busy");
});

// ── アプリを通さずに、利用者が関数を直接呼んだ場合(2026-10-27、Mahiroの指摘で追加)──
// 利用者は、公開されている鍵(anon key)と自分のログイン状態で、DBの関数を直接呼べる。
// 3つの関数は、アプリのサーバーだけが知る合言葉(Vercelの環境変数。DBにはSHA-256の要約だけ)が無いと動かない。
const forbidden = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return /forbidden/.test(String((e as Error).message));
  }
};

test("Q-12 合言葉なし・違う合言葉・空で直接呼ぶと断られ、本人の回数も全体の回数も増えない(複数のアカウントでも同じ)", async () => {
  await setClock("2026-11-10 10:00");
  const before = await Promise.all([A, B, C].map((u) => monthly(u, "2026-11")));
  for (const uid of [A, B, C]) {
    assert.ok(await forbidden(() => begin(uid, null)), "合言葉なし");
    assert.ok(await forbidden(() => begin(uid, "wrong-token")), "違う合言葉");
    assert.ok(await forbidden(() => begin(uid, "")), "空");
  }
  assert.deepEqual(await Promise.all([A, B, C].map((u) => monthly(u, "2026-11"))), before);
  assert.equal(await daily("2026-11-10"), 0);
});

test("Q-13 DBに合言葉が設定されていないときは、正しい値でも断る(設定し忘れても、勝手に動かない)", async () => {
  await db.exec("create temp table saved as select * from app_server_tokens; delete from app_server_tokens;");
  try {
    assert.ok(await forbidden(() => begin(A)));
  } finally {
    await db.exec("insert into app_server_tokens select * from saved; drop table saved;");
  }
});

test("Q-14 1人あたり1日20回まで(日本時間)。21回目は「今日の上限」。取り消した分は数えない。翌日は読み取れる", async () => {
  await setClock("2026-11-11 09:00");
  const C2 = "00000000-0000-0000-0000-0000000000c2";
  await db.exec(`insert into auth.users values ('${C2}', 'c2@example.com')`);
  const firstTwo: string[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await begin(C2);
    assert.equal(r.result, "ok", `${i + 1}回目`);
    if (i < 2) firstTwo.push(r.reservation!);
  }
  assert.equal((await begin(C2)).result, "daily_user_limit");
  await cancel(C2, firstTwo[0], "busy"); // AI側の都合で取り消した1回は数えない
  assert.equal((await begin(C2)).result, "ok");
  assert.equal((await begin(C2)).result, "daily_user_limit");
  await setClock("2026-11-12 00:00:00");
  assert.equal((await begin(C2)).result, "ok");
});

test("Q-15 1人の1日の上限があるので、1つのアカウントが使える全体の枠は1日20回まで(200回を使い切るには10アカウント以上が要る)", async () => {
  await setClock("2026-11-13 09:00");
  const D = "00000000-0000-0000-0000-00000000000d";
  await db.exec(`insert into auth.users values ('${D}', 'd@example.com')`);
  for (let i = 0; i < 25; i++) await begin(D);
  assert.equal(await daily("2026-11-13"), 20);
});

test("Q-16 成功を数える・取り消す関数も、合言葉なしでは動かない(残高不足の記録を勝手に作れない)", async () => {
  await setClock("2026-11-14 09:00");
  const r = await begin(A);
  assert.equal(r.result, "ok");
  const incidentsBefore = (await db.query("select * from ocr_service_incidents")).rows.length;
  assert.ok(await forbidden(() => complete(A, r.reservation!, "wrong-token")));
  assert.ok(await forbidden(() => cancel(A, r.reservation!, "credit", "wrong-token")));
  assert.equal((await db.query("select * from ocr_service_incidents")).rows.length, incidentsBefore);
  assert.equal(typeof (await complete(A, r.reservation!)), "number"); // 正しい合言葉なら数える
});

test("0030 古い数え方の関数と累計の表は無くなり、二度実行してもエラーにならず、新しい数え方は動く", async () => {
  await db.exec(readFileSync(join(MIG, "0030_drop_old_ocr_usage.sql"), "utf8"));
  const gone = await db.query<{ f1: boolean; f2: boolean; t: boolean; log: number }>(`
    select exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'begin_ocr_attempt') as f1,
           exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'complete_ocr_success') as f2,
           to_regclass('public.ocr_usage') is not null as t,
           (select count(*)::int from migration_log where version = '0030') as log`);
  assert.deepEqual(gone.rows[0], { f1: false, f2: false, t: false, log: 1 });
  await setClock("2026-12-01 09:00");
  assert.equal((await begin(A)).result, "ok");
});
