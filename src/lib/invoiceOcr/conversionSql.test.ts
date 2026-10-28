import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// マイグレーション0031(換算を覚える表・二度読みの記録)を、使い捨てのPostgres(pglite)に0001〜0031を流して確かめる(2026-10-28)。
// 期待値S-1〜S-9はMahiroが確認する。Supabaseの auth.uid() と、利用者の権限(authenticated)の決まりをまねている。

const MIG = join(process.cwd(), "supabase", "migrations");
const A = "00000000-0000-0000-0000-00000000000a"; // 店主A
const B = "00000000-0000-0000-0000-00000000000b"; // 別の店の店主B
let db: PGlite;
let storeA = "";
let storeB = "";
let onionA = ""; // Aの店の玉ねぎ(単位 g)
let potatoA = ""; // Aの店のじゃがいも(単位 g)

/** 利用者として実行する(auth.uid() がその人になり、権限の決まりが効く) */
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
const conversions = async (uid: string) =>
  as<{ purchase_unit: string; normalized_unit: string; amount: string; amount_unit: string; source: string }>(
    uid,
    "select purchase_unit, normalized_unit, amount::text, amount_unit, source from ingredient_unit_conversions order by purchase_unit",
  );
const upsertConversion = (ingredientId: string, unit: string, amount: number, amountUnit: string, source = "owner") =>
  `insert into ingredient_unit_conversions (ingredient_id, purchase_unit, amount, amount_unit, source)
   values ('${ingredientId}', '${unit}', ${amount}, '${amountUnit}', '${source}')
   on conflict (ingredient_id, normalized_unit) do update set purchase_unit = excluded.purchase_unit, amount = excluded.amount,
     amount_unit = excluded.amount_unit, source = excluded.source`;

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
  storeA = (await db.query<{ id: string }>(`insert into stores (owner_id, name) values ('${A}', 'A店') returning id`)).rows[0].id;
  storeB = (await db.query<{ id: string }>(`insert into stores (owner_id, name) values ('${B}', 'B店') returning id`)).rows[0].id;
  onionA = (await db.query<{ id: string }>(`insert into ingredients (store_id, name, normalized_name, unit) values ('${storeA}', '玉ねぎ', '玉ねぎ', 'g') returning id`)).rows[0].id;
  potatoA = (await db.query<{ id: string }>(`insert into ingredients (store_id, name, normalized_name, unit) values ('${storeA}', 'じゃがいも', 'じゃがいも', 'g') returning id`)).rows[0].id;
});

test("S-1 0031は二度実行しても同じ形になる(エラーにならない)・migration_logに0031が入る", async () => {
  await db.exec(readFileSync(join(MIG, "0031_unit_conversions_and_invoice_records.sql"), "utf8"));
  const r = await db.query<{ n: number }>("select count(*)::int as n from migration_log where version = '0031'");
  assert.equal(r.rows[0].n, 1);
});

test("S-2 店主Aが、自分の店の玉ねぎに「1個 = 200g」を覚えさせられる。じゃがいもに「1箱 = 10kg」(kgのまま持つ)", async () => {
  await as(A, upsertConversion(onionA, "個", 200, "g"));
  await as(A, upsertConversion(potatoA, "箱", 10, "kg", "estimate"));
  assert.deepEqual(await conversions(A), [
    { purchase_unit: "個", normalized_unit: "個", amount: "200", amount_unit: "g", source: "owner" },
    { purchase_unit: "箱", normalized_unit: "箱", amount: "10", amount_unit: "kg", source: "estimate" },
  ]);
});

test("S-3 同じ食材・同じ単位(「個 」のように空白付きでも)は、1行のまま上書きされる(200g → 210g)", async () => {
  await as(A, upsertConversion(onionA, "個 ", 210, "g"));
  const rows = (await conversions(A)).filter((r) => r.normalized_unit === "個");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, "210");
  // 全角の「ｋｇ」と半角の「kg」も同じ単位として1行になる
  await as(A, upsertConversion(onionA, "ｋｇ", 1, "kg"));
  await as(A, upsertConversion(onionA, "KG", 1, "kg"));
  assert.equal((await conversions(A)).filter((r) => r.normalized_unit === "kg").length, 1);
  await as(A, `delete from ingredient_unit_conversions where ingredient_id = '${onionA}' and normalized_unit = 'kg'`);
});

test("S-4 別の店の店主Bは、Aの換算を見られない・足せない・直せない・消せない", async () => {
  assert.equal((await conversions(B)).length, 0);
  assert.equal(await fails(B, upsertConversion(onionA, "袋", 500, "g")), true);
  await as(B, `update ingredient_unit_conversions set amount = 1 where ingredient_id = '${onionA}'`);
  await as(B, `delete from ingredient_unit_conversions where ingredient_id = '${onionA}'`);
  const a = await conversions(A);
  assert.equal(a.find((r) => r.purchase_unit === "個 ")?.amount, "210");
  assert.equal(a.length, 2);
});

test("S-5 換算が0・マイナス・100万を超える・単位が空や21文字以上は、DBが断る", async () => {
  assert.equal(await fails(A, upsertConversion(onionA, "袋", 0, "g")), true);
  assert.equal(await fails(A, upsertConversion(onionA, "袋", -1, "g")), true);
  assert.equal(await fails(A, upsertConversion(onionA, "袋", 1000001, "g")), true);
  assert.equal(await fails(A, upsertConversion(onionA, " ", 100, "g")), true);
  assert.equal(await fails(A, upsertConversion(onionA, "あ".repeat(21), 100, "g")), true);
  assert.equal(await fails(A, upsertConversion(onionA, "袋", 100, "g", "ai")), true); // 出どころは owner・estimate だけ
  assert.equal(await fails(A, upsertConversion(onionA, "あ".repeat(20), 100, "g")), false); // 20文字までは入る
});

test("S-6 店主Aが自分の店の二度読みの記録を足して読める。Bは、Aの店の記録を見られず、Aの店に足せない", async () => {
  const ins = (store: string) =>
    `insert into invoice_scan_records (store_id, invoice_date, supplier_normalized, total_amount) values ('${store}', '2026-10-20', '山田青果', 12960)`;
  await as(A, ins(storeA));
  assert.equal((await as(A, "select * from invoice_scan_records")).length, 1);
  assert.equal((await as(B, "select * from invoice_scan_records")).length, 0);
  assert.equal(await fails(B, ins(storeA)), true);
  assert.equal(await fails(B, ins(storeB)), false); // 自分の店にはBも足せる
});

test("S-7 二度読みの記録は、直す・消すができない(誰も。店舗を消したときに一緒に消えるだけ)", async () => {
  await as(A, "update invoice_scan_records set total_amount = 0");
  await as(A, "delete from invoice_scan_records");
  const r = await as<{ total_amount: string }>(A, "select total_amount::text from invoice_scan_records");
  assert.deepEqual(r, [{ total_amount: "12960" }]);
});

test("S-8 食材を消すと、その食材の換算も消える", async () => {
  await db.exec(`delete from ingredients where id = '${potatoA}'`);
  assert.equal((await conversions(A)).filter((r) => r.purchase_unit === "箱").length, 0);
});

test("S-9 アカウントを消すと(退会)、店舗・食材と一緒に、換算と二度読みの記録も消える", async () => {
  await db.exec(`delete from auth.users where id = '${A}'`);
  const n = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0].n;
  assert.equal(await n("ingredient_unit_conversions"), 0);
  assert.equal((await db.query<{ n: number }>(`select count(*)::int as n from invoice_scan_records where store_id = '${storeA}'`)).rows[0].n, 0);
  assert.equal(await n("invoice_scan_records"), 1); // Bの店の分は残る
});
