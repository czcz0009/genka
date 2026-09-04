import { test } from "node:test";
import assert from "node:assert/strict";
import { applySalesMapping, buildSalesImportPlan } from "./applySalesMapping.ts";

// headers: メニュー名(0), 販売数量(1)
const mapping = { menuName: 0, quantitySold: 1 };

test("正常な行を取り込める", () => {
  const rows = [["ナポリタン", "12"]];
  const { rows: parsed, errors } = applySalesMapping(rows, mapping);
  assert.equal(errors.length, 0);
  assert.equal(parsed[0].menuName, "ナポリタン");
  assert.equal(parsed[0].quantitySold, 12);
});

test("必須項目が空の行はエラーにする", () => {
  const rows = [["", "12"], ["ナポリタン", ""]];
  const { rows: parsed, errors } = applySalesMapping(rows, mapping);
  assert.equal(parsed.length, 0);
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /メニュー名/);
  assert.match(errors[1].message, /販売数量/);
});

test("負の値・数値として読めない販売数量はエラーにする", () => {
  const rows = [
    ["ナポリタン", "-1"],
    ["ミートソース", "たくさん"],
  ];
  const { rows: parsed, errors } = applySalesMapping(rows, mapping);
  assert.equal(parsed.length, 0);
  assert.equal(errors.length, 2);
});

test("小数はまるめて整数として扱う", () => {
  const rows = [["ナポリタン", "12.4"]];
  const { rows: parsed } = applySalesMapping(rows, mapping);
  assert.equal(parsed[0].quantitySold, 12);
});

test("空行は無視する", () => {
  const rows = [["ナポリタン", "1"], ["", ""]];
  const { rows: parsed, errors } = applySalesMapping(rows, mapping);
  assert.equal(parsed.length, 1);
  assert.equal(errors.length, 0);
});

test("buildSalesImportPlan: 日別内訳など同一メニューの複数行を合算する", () => {
  const rows = [
    ["ナポリタン", "3"],
    ["ナポリタン", "5"],
    [" ナポリタン　", "2"], // 表記ゆれ(空白)も同一メニューとして合算
    ["ミートソース", "1"],
  ];
  const { rows: parsed } = applySalesMapping(rows, mapping);
  const plan = buildSalesImportPlan(parsed);
  const napolitan = plan.find((p) => p.normalizedName === plan[0].normalizedName && p.menuName === "ナポリタン");
  assert.ok(napolitan);
  assert.equal(napolitan!.totalQuantitySold, 10);
  assert.equal(napolitan!.rowCount, 3);
  assert.equal(plan.length, 2);
});
