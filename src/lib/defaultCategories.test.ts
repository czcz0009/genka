import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeForDedupe } from "./normalize.ts";

/**
 * 0025_categories.sql(カテゴリ機能のマイグレーション)の内容を読み取って検証する。
 *
 * デフォルトカテゴリはSQLで作成するため、normalized_name(重複判定用の名前)を
 * SQLに直接書いている。これがアプリ側の正規化(normalizeForDedupe)とずれていると、
 * 「同じ名前のカテゴリを作れない」制約がデフォルトカテゴリに効かなくなるため、
 * ここで照合する。あわせて、get_store_dataの変更が意図した1項目だけであること、
 * 元に戻すSQLが0021版と一致することも確認する。
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, migrationsDir), "utf8").replace(/\r\n/g, "\n");

const migration = read("0025_categories.sql");
const rollback = read("rollback_0025_categories.sql");
const m0021 = read("0021_expose_price_is_set.sql");

function seedRows(sql: string): { kind: string; name: string; normalizedName: string; sortOrder: number }[] {
  const re = /\(p_store_id, '(menu|ingredient)', '([^']+)', '([^']+)', (\d+)\)/g;
  return [...sql.matchAll(re)].map((m) => ({ kind: m[1], name: m[2], normalizedName: m[3], sortOrder: Number(m[4]) }));
}

function getStoreDataFunction(sql: string): string {
  const start = sql.indexOf("create or replace function public.get_store_data(");
  assert.notEqual(start, -1, "get_store_dataの定義が見つかりません");
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end + 4);
}

test("デフォルトカテゴリ: メニューは指定の6件が指定の順番で作られる", () => {
  const menus = seedRows(migration).filter((r) => r.kind === "menu");
  assert.deepEqual(
    menus.map((r) => r.name),
    ["前菜・一品", "メイン", "ご飯・麺類", "サイド", "ドリンク", "デザート"],
  );
  assert.deepEqual(menus.map((r) => r.sortOrder), [1, 2, 3, 4, 5, 6]);
});

test("デフォルトカテゴリ: 食材は指定の9件が指定の順番で作られる", () => {
  const ingredients = seedRows(migration).filter((r) => r.kind === "ingredient");
  assert.deepEqual(
    ingredients.map((r) => r.name),
    ["野菜・果物", "肉", "魚介", "卵・乳製品", "米・麺・粉", "調味料・油", "乾物・缶詰", "飲料・酒", "その他"],
  );
  assert.deepEqual(ingredients.map((r) => r.sortOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("デフォルトカテゴリ: SQLに書いたnormalized_nameがアプリの正規化結果と一致する", () => {
  const rows = seedRows(migration);
  assert.equal(rows.length, 15);
  for (const r of rows) {
    assert.equal(r.normalizedName, normalizeForDedupe(r.name), `「${r.name}」の正規化名がずれています`);
  }
});

test("get_store_data: 0021版からの変更はmenusへのcategory_id追加の1項目だけ", () => {
  const before = getStoreDataFunction(m0021);
  const after = getStoreDataFunction(migration);
  const expected = before.replace(
    "        'created_at', m.created_at\n",
    "        'created_at', m.created_at,\n        'category_id', m.category_id\n",
  );
  assert.notEqual(expected, before, "置き換え対象の行が0021版に見つかりません");
  assert.equal(after, expected);
});

test("get_store_data: security invoker・auth.uid()での絞り込み・戻り値json・引数が0025版でも維持されている", () => {
  const after = getStoreDataFunction(migration);
  assert.match(after, /\nsecurity invoker\n/);
  assert.match(after, /where owner_id = auth\.uid\(\);/);
  assert.match(after, /\nreturns json\n/);
  assert.match(after, /p_sales_from date default null,\n  p_sales_to date default null\n/);
  assert.doesNotMatch(after, /security definer/);
});

test("マイグレーションは全体が1つのトランザクション(begin〜commit)", () => {
  const statements = migration.split("\n").filter((l) => !l.startsWith("--") && l.trim() !== "");
  assert.equal(statements[0], "begin;");
  assert.equal(statements[statements.length - 1], "commit;");
});

test("元に戻すSQLは全体が1つの do ブロック(2026-10-23。SQL Editorでは begin〜commit がまとまりにならないことがあるため)", () => {
  const statements = rollback.split("\n").filter((l) => !l.startsWith("--") && l.trim() !== "");
  assert.equal(statements[0], "do $rollback$");
  assert.equal(statements[1], "begin");
  assert.equal(statements[statements.length - 1], "end $rollback$;");
  // do ブロックの外に文が無い(開始と終わりの印が1組だけ)
  assert.equal(rollback.split("$rollback$").length - 1, 2);
});

test("元に戻すSQL: get_store_dataが0021版と完全に一致する", () => {
  assert.equal(getStoreDataFunction(rollback), getStoreDataFunction(m0021));
});

test("新しい関数はすべてsecurity invoker(security definerを使っていない)", () => {
  assert.doesNotMatch(migration, /security definer/i);
});
