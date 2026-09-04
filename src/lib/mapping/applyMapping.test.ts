import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMapping, buildImportPlan } from "./applyMapping.ts";

// headers: メニュー名(0), 食材名(1), 分量(2), 単位(3), 仕入単価(4), 売価(5)
const mapping = {
  menuName: 0,
  ingredientName: 1,
  quantity: 2,
  unit: 3,
  purchasePrice: 4,
  sellingPrice: 5,
};

test("正常な行はすべて取り込み対象になる", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["ナポリタン", "ケチャップ", "30", "g", "20", "900"],
  ];
  const { rows: parsed, errors } = applyMapping(rows, mapping);
  assert.equal(errors.length, 0);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].menuName, "ナポリタン");
  assert.equal(parsed[0].quantity, 120);
});

test("必須項目が空の行はエラーとして報告し、取り込み対象から除外する", () => {
  const rows = [
    ["ナポリタン", "", "120", "g", "80", "900"], // 食材名が空
    ["ナポリタン", "パスタ麺", "120", "", "80", "900"], // 単位が空
  ];
  const { rows: parsed, errors } = applyMapping(rows, mapping);
  assert.equal(parsed.length, 0);
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /食材名/);
  assert.equal(errors[0].sheetRow, 2);
  assert.match(errors[1].message, /単位/);
  assert.equal(errors[1].sheetRow, 3);
});

test("1行目からメニュー名が空(引き継ぎ元が存在しない)場合は、これまでどおりエラーにする", () => {
  const rows = [["", "パスタ麺", "120", "g", "80", "900"]];
  const { rows: parsed, errors, menuNameFills } = applyMapping(rows, mapping);
  assert.equal(parsed.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /メニュー名/);
  assert.equal(menuNameFills.length, 0);
});

test("分量が数値として読めない行はエラーにする", () => {
  const rows = [["ナポリタン", "パスタ麺", "たくさん", "g", "80", "900"]];
  const { rows: parsed, errors } = applyMapping(rows, mapping);
  assert.equal(parsed.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /分量/);
});

test("完全な空行は無視する(エラーにもしない)", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["", "", "", "", "", ""],
  ];
  const { rows: parsed, errors } = applyMapping(rows, mapping);
  assert.equal(parsed.length, 1);
  assert.equal(errors.length, 0);
});

test("buildImportPlan: 表記ゆれのある同一食材を1件にまとめる", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["ミートソース", " パスタ麺　", "100", "g", "80", "980"], // 表記ゆれ(空白)
  ];
  const { rows: parsed } = applyMapping(rows, mapping);
  const plan = buildImportPlan(parsed);

  assert.equal(plan.ingredients.length, 1);
  assert.equal(plan.menus.length, 2);
  assert.equal(plan.menus[0].ingredients.length, 1);
});

test("全角数字・カンマ区切りの数値もパイプライン全体で正しく取り込める", () => {
  const rows = [["ナポリタン", "パスタ麺", "１２０", "g", "1,500", "900"]];
  const { rows: parsed, errors } = applyMapping(rows, mapping);
  assert.equal(errors.length, 0);
  assert.equal(parsed[0].quantity, 120);
  assert.equal(parsed[0].purchasePrice, 1500);
});

test("Excel結合セル由来でメニュー名が空欄の行は、直前行のメニュー名をforward-fillで引き継ぐ", () => {
  // 実際のExcelで「メニュー名」セルを複数のレシピ行にまたがって結合していると、
  // SheetJSは結合範囲の先頭セル以外を空文字として返す。エラーにするのではなく、
  // 直前に実際に入力されていた値を引き継ぐ。
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["", "ケチャップ", "30", "g", "20", "900"], // 結合セルの2行目由来を想定した空欄
  ];
  const { rows: parsed, errors, menuNameFills } = applyMapping(rows, mapping);
  assert.equal(errors.length, 0);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].menuName, "ナポリタン");
  assert.equal(menuNameFills.length, 1);
  assert.equal(menuNameFills[0].sheetRow, 3);
  assert.equal(menuNameFills[0].menuName, "ナポリタン");
  assert.equal(menuNameFills[0].filledFromSheetRow, 2);
});

test("forward-fillはメニュー名列だけに限定される(分量・単位・仕入単価は空欄なら引き継がずエラーにする)", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["", "ケチャップ", "", "g", "20", "900"], // メニュー名は引き継ぐが、分量は空のままエラー
  ];
  const { rows: parsed, errors, menuNameFills } = applyMapping(rows, mapping);
  assert.equal(parsed.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /分量/);
  assert.doesNotMatch(errors[0].message, /メニュー名/);
  // メニュー名の引き継ぎ自体は、その行が他の理由でエラーになっても記録に残る
  assert.equal(menuNameFills.length, 1);
});

test("空行を挟むと引き継ぎはリセットされる(別メニューの入力漏れまで拡大しない)", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["", "", "", "", "", ""], // 空行(区切り)
    ["", "鶏もも肉", "150", "g", "140", "980"], // 本来は別メニューだが、メニュー名の入力漏れ
  ];
  const { rows: parsed, errors, menuNameFills } = applyMapping(rows, mapping);
  assert.equal(menuNameFills.length, 0);
  assert.equal(parsed.length, 1); // 3行目は引き継ぎ候補がなくエラーになり除外される
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /メニュー名/);
});

test("buildImportPlan: forward-fillされた行も正しく元のメニューに統合される", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["", "ケチャップ", "30", "g", "20", "900"],
  ];
  const { rows: parsed } = applyMapping(rows, mapping);
  const plan = buildImportPlan(parsed);
  assert.equal(plan.menus.length, 1);
  assert.equal(plan.menus[0].name, "ナポリタン");
  assert.equal(plan.menus[0].ingredients.length, 2);
});

test("buildImportPlan: 同一食材で単位や仕入単価が食い違う場合は警告を積む", () => {
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["ミートソース", "パスタ麺", "100", "袋", "90", "980"], // 単位・単価が食い違う
  ];
  const { rows: parsed } = applyMapping(rows, mapping);
  const plan = buildImportPlan(parsed);

  assert.equal(plan.ingredients.length, 1);
  assert.equal(plan.ingredients[0].conflicts.length, 2);
});
