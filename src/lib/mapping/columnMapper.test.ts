import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestColumnMapping } from "./columnMapper.ts";

test("見出しが完全一致する場合は高信頼度で正しく割り当てる", () => {
  const headers = ["メニュー名", "食材名", "分量", "単位", "仕入単価", "売価"];
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g", "80", "900"],
    ["ナポリタン", "ケチャップ", "30", "g", "20", "900"],
    ["ミートソース", "パスタ麺", "120", "g", "80", "980"],
  ];

  const suggestions = suggestColumnMapping(headers, rows);
  const byField = Object.fromEntries(suggestions.map((s) => [s.fieldId, s]));

  assert.equal(byField.menuName.header, "メニュー名");
  assert.equal(byField.ingredientName.header, "食材名");
  assert.equal(byField.quantity.header, "分量");
  assert.equal(byField.unit.header, "単位");
  assert.equal(byField.purchasePrice.header, "仕入単価");
  assert.equal(byField.sellingPrice.header, "売価");
  for (const s of suggestions) assert.equal(s.level, "high");
});

test("表記ゆれのある見出し(同義語)も推測できる", () => {
  const headers = ["商品名", "材料名", "使用量", "単位", "仕入れ値"];
  const rows = [
    ["カレーライス", "玉ねぎ", "50", "g", "30"],
    ["カレーライス", "米", "1", "合", "150"],
  ];

  const suggestions = suggestColumnMapping(headers, rows);
  const byField = Object.fromEntries(suggestions.map((s) => [s.fieldId, s]));

  assert.equal(byField.menuName.header, "商品名");
  assert.equal(byField.ingredientName.header, "材料名");
  assert.equal(byField.quantity.header, "使用量");
  assert.equal(byField.unit.header, "単位");
  assert.equal(byField.purchasePrice.header, "仕入れ値");
});

test("関係のない列(備考など)は未割り当てのままにする", () => {
  const headers = ["メニュー名", "食材名", "分量", "単位", "備考"];
  const rows = [["ナポリタン", "パスタ麺", "120", "g", "特になし"]];

  const suggestions = suggestColumnMapping(headers, rows);
  const mappedHeaders = new Set(suggestions.map((s) => s.header).filter(Boolean));
  assert.equal(mappedHeaders.has("備考"), false);

  const purchasePrice = suggestions.find((s) => s.fieldId === "purchasePrice")!;
  assert.equal(purchasePrice.header, null);
  assert.equal(purchasePrice.level, "none");
});

test("同じ列を2つのフィールドが取り合わない(1対1割り当て)", () => {
  const headers = ["品目", "分量", "単位"];
  const rows = [["小麦粉", "100", "g"]];

  const suggestions = suggestColumnMapping(headers, rows);
  const mappedColumns = suggestions.map((s) => s.columnIndex).filter((i) => i !== null);
  const unique = new Set(mappedColumns);
  assert.equal(unique.size, mappedColumns.length);
});

test("内容(数値かどうか)は候補の並び替えには使うが、名前の手がかりが皆無なら自動選択はしない", () => {
  // ヘッダー名がフィールドのどの同義語にも一切似ていない場合、
  // セルの中身がどれだけ数値らしくても「内容だけ」で確信度0.5を超えることは
  // 構造上あり得ない(内容スコアの重みは0.3が上限のため)。
  // 候補の並び替え(将来UIでヒント表示する用途)には使われるが、自動選択はしない。
  const headers = ["A", "B"];
  const rows = [
    ["パスタ麺", "120"],
    ["ケチャップ", "30"],
  ];
  const suggestions = suggestColumnMapping(headers, rows);
  const quantity = suggestions.find((s) => s.fieldId === "quantity")!;

  // 数値列(B)が候補としては最有力(=順位付けには効いている)
  assert.equal(quantity.candidates[0].header, "B");
  // しかし自動では選ばれず、ユーザーの手動選択待ちのまま
  assert.equal(quantity.header, null);
  assert.equal(quantity.level, "none");
});

test("1文字の同義語(「量」等)による見せかけの包含一致で、無関係な列を誤って高確信度採用しない", () => {
  // 「重量」は分量(使用量)の同義語ではないが、1文字の同義語「量」を
  // 含んでしまう。内容が数値でも、これだけで自動選択されてはいけない。
  const headers = ["メニュー名", "食材名", "重量", "単位"];
  const rows = [
    ["ナポリタン", "パスタ麺", "250", "g"],
    ["ミートソース", "パスタ麺", "300", "g"],
  ];
  const suggestions = suggestColumnMapping(headers, rows);
  const quantity = suggestions.find((s) => s.fieldId === "quantity")!;
  assert.equal(quantity.header, null);
  assert.equal(quantity.level, "none");
});

test("列ヘッダーの表記ゆれ(前後の空白・全角空白・大文字小文字)を吸収して推測できる", () => {
  const headers = [" メニュー名", "食材名　", "分量", "　単位　", "仕入単価"];
  const rows = [["ナポリタン", "パスタ麺", "120", "g", "80"]];
  const suggestions = suggestColumnMapping(headers, rows);
  const byField = Object.fromEntries(suggestions.map((s) => [s.fieldId, s]));

  assert.equal(byField.menuName.header, " メニュー名");
  assert.equal(byField.ingredientName.header, "食材名　");
  assert.equal(byField.unit.header, "　単位　");
  assert.equal(byField.purchasePrice.header, "仕入単価");
});

test("単位が「個・本・g・kg・ml」等で行ごとに混在していても単位列の推測精度は落ちない", () => {
  const headers = ["メニュー名", "食材名", "分量", "単位"];
  const rows = [
    ["ナポリタン", "パスタ麺", "120", "g"],
    ["ナポリタン", "卵", "1", "個"],
    ["から揚げ定食", "鶏もも肉", "1", "本"],
    ["から揚げ定食", "サラダ油", "500", "ml"],
    ["から揚げ定食", "米", "1", "kg"],
  ];
  const suggestions = suggestColumnMapping(headers, rows);
  const byField = Object.fromEntries(suggestions.map((s) => [s.fieldId, s]));
  assert.equal(byField.unit.header, "単位");
  assert.equal(byField.unit.level, "high");
});
