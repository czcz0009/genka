import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// マイグレーション0032(名前の対応づけを覚える表)を、使い捨てのPostgres(pglite)に0001〜0032を流して確かめる(2026-10-28)。
// 期待値S2-1〜S2-7はMahiroが確認する。Supabaseの auth.uid() と、利用者の権限(authenticated)の決まりをまねている。

const MIG = join(process.cwd(), "supabase", "migrations");
const A = "00000000-0000-0000-0000-00000000000a"; // 店主A
const B = "00000000-0000-0000-0000-00000000000b"; // 別の店の店主B
let db: PGlite;
let storeA = "";
let storeB = "";
let onionA = "";
let cabbageA = "";
let onionB = "";

async function as<T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
async function fails(uid: string, sql: string): Promise<boolean> {
  try {
    await as(uid, sql);
    return false;
  } catch {
    return true;
  }
}
const upsert = (store: string, ingredient: string, alias: string, normalized = alias) =>
  `insert into ingredient_name_aliases (store_id, ingredient_id, alias, normalized_alias) values ('${store}', '${ingredient}', '${alias}', '${normalized}')
   on conflict (store_id, normalized_alias) do update set ingredient_id = excluded.ingredient_id, alias = excluded.alias`;
const aliases = (uid: string) =>
  as<{ alias: string; ingredient_id: string }>(uid, "select alias, ingredient_id::text from ingredient_name_aliases order by alias");

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
  await db.exec(`insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');`);
  const id = async (sql: string) => (await db.query<{ id: string }>(sql)).rows[0].id;
  storeA = await id(`insert into stores (owner_id, name) values ('${A}', 'A店') returning id`);
  storeB = await id(`insert into stores (owner_id, name) values ('${B}', 'B店') returning id`);
  onionA = await id(`insert into ingredients (store_id, name, normalized_name, unit) values ('${storeA}', 'たまねぎ', 'たまねぎ', 'g') returning id`);
  cabbageA = await id(`insert into ingredients (store_id, name, normalized_name, unit) values ('${storeA}', 'キャベツ', 'キャベツ', '個') returning id`);
  onionB = await id(`insert into ingredients (store_id, name, normalized_name, unit) values ('${storeB}', '玉ねぎ', '玉ねぎ', 'g') returning id`);
});

test("S2-1 0032は二度実行しても同じ形になる(エラーにならない)・migration_logに0032が入る", async () => {
  await db.exec(readFileSync(join(MIG, "0032_ingredient_name_aliases.sql"), "utf8"));
  const r = await db.query<{ n: number }>("select count(*)::int as n from migration_log where version = '0032'");
  assert.equal(r.rows[0].n, 1);
});

test("S2-2 店主Aが、自分の店の食材に「玉葱 → たまねぎ」を覚えさせられる", async () => {
  await as(A, upsert(storeA, onionA, "玉葱"));
  assert.deepEqual(await aliases(A), [{ alias: "玉葱", ingredient_id: onionA }]);
});

test("S2-3 同じ表記を別の食材に選び直すと、1行のまま上書きされる(玉葱 → キャベツ → たまねぎ)", async () => {
  await as(A, upsert(storeA, cabbageA, "玉葱"));
  assert.deepEqual(await aliases(A), [{ alias: "玉葱", ingredient_id: cabbageA }]);
  await as(A, upsert(storeA, onionA, "玉葱"));
  assert.deepEqual(await aliases(A), [{ alias: "玉葱", ingredient_id: onionA }]);
});

test("S2-4 別の店の店主Bは、Aの対応を見られない・足せない・直せない・消せない", async () => {
  assert.equal((await aliases(B)).length, 0);
  assert.equal(await fails(B, upsert(storeA, onionA, "タマネギ")), true);
  await as(B, `update ingredient_name_aliases set ingredient_id = '${cabbageA}'`);
  await as(B, "delete from ingredient_name_aliases");
  assert.deepEqual(await aliases(A), [{ alias: "玉葱", ingredient_id: onionA }]);
});

test("S2-5 ★店舗と食材の食い違いは断る: 自分の店舗の行に他の店の食材、他の店の店舗の行に自分の食材", async () => {
  assert.equal(await fails(A, upsert(storeA, onionB, "玉ねぎ")), true); // Aの店舗 × Bの食材
  assert.equal(await fails(B, upsert(storeA, onionB, "玉ねぎ")), true); // Aの店舗 × Bの食材(Bから)
  assert.equal(await fails(B, upsert(storeB, onionA, "玉ねぎ")), true); // Bの店舗 × Aの食材
  assert.equal(await fails(B, upsert(storeB, onionB, "玉葱")), false); // 自分の店舗 × 自分の食材は足せる
});

test("S2-6 表記が空・101文字以上は、DBが断る(100文字までは入る)", async () => {
  assert.equal(await fails(A, upsert(storeA, onionA, " ", "")), true);
  assert.equal(await fails(A, upsert(storeA, onionA, "あ".repeat(101))), true);
  assert.equal(await fails(A, upsert(storeA, onionA, "あ".repeat(100))), false);
});

test("S2-7 食材を消すと対応も消える。アカウントを消すと(退会)、その店の対応はすべて消える", async () => {
  await db.exec(`delete from ingredients where id = '${onionA}'`);
  assert.equal((await aliases(A)).length, 0);
  await as(A, upsert(storeA, cabbageA, "きゃべつ"));
  await db.exec(`delete from auth.users where id = '${A}'`);
  const n = (await db.query<{ n: number }>(`select count(*)::int as n from ingredient_name_aliases where store_id = '${storeA}'`)).rows[0].n;
  assert.equal(n, 0);
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from ingredient_name_aliases")).rows[0].n, 1); // Bの分は残る
});
