import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCategoryChips,
  computeMovedSortOrders,
  filterByCategoryTab,
  initialCategoryIdForNewItem,
  nextSortOrder,
  parseCategoryTab,
  validateCategoryName,
  type Category,
} from "./categories.ts";

const categories: Category[] = [
  { id: "c-main", kind: "menu", name: "メイン", sortOrder: 2 },
  { id: "c-starter", kind: "menu", name: "前菜・一品", sortOrder: 1 },
  { id: "c-drink", kind: "menu", name: "ドリンク", sortOrder: 3 },
];

const menus = [
  { name: "唐揚げ", categoryId: "c-main" },
  { name: "焼き魚定食", categoryId: "c-main" },
  { name: "枝豆", categoryId: "c-starter" },
  { name: "まかない", categoryId: null },
];

test("タブ: すべて / カテゴリ(並び順どおり) / 未分類 の順に件数つきで並ぶ。0件のカテゴリも出す", () => {
  const chips = buildCategoryChips(menus, categories, { includePrepTab: false });
  assert.deepEqual(
    chips.map((c) => [c.label, c.count]),
    [
      ["すべて", 4],
      ["前菜・一品", 1],
      ["メイン", 2],
      ["ドリンク", 0],
      ["未分類", 1],
    ],
  );
});

test("タブ: 未分類が0件なら未分類のタブを出さない", () => {
  const chips = buildCategoryChips(
    menus.filter((m) => m.categoryId != null),
    categories,
    { includePrepTab: false },
  );
  assert.equal(chips.some((c) => c.label === "未分類"), false);
});

test("タブ: 各カテゴリ+未分類の件数の合計が、すべての件数と一致する(数え漏れ・二重計上がない)", () => {
  const chips = buildCategoryChips(menus, categories, { includePrepTab: false });
  const total = chips.filter((c) => c.label !== "すべて").reduce((sum, c) => sum + c.count, 0);
  assert.equal(total, chips[0].count);
});

test("食材一覧: 仕込み品は「仕込み品」タブにだけ出て、カテゴリ・未分類には数えない", () => {
  const ingredientCategories: Category[] = [{ id: "c-veg", kind: "ingredient", name: "野菜・果物", sortOrder: 1 }];
  const ingredients = [
    { name: "たまねぎ", categoryId: "c-veg", isPrepItem: false },
    { name: "豚肉", categoryId: null, isPrepItem: false },
    { name: "合わせだし", categoryId: null, isPrepItem: true },
    // 仕込み品にカテゴリが付いていても(DBでは禁止していないため)、仕込み品タブにだけ出す
    { name: "甘酢", categoryId: "c-veg", isPrepItem: true },
  ];
  const chips = buildCategoryChips(ingredients, ingredientCategories, { includePrepTab: true });
  assert.deepEqual(
    chips.map((c) => [c.label, c.count]),
    [
      ["すべて", 4],
      ["野菜・果物", 1],
      ["仕込み品", 2],
      ["未分類", 1],
    ],
  );
  assert.deepEqual(
    filterByCategoryTab(ingredients, { type: "prep" }, ingredientCategories).map((i) => i.name),
    ["合わせだし", "甘酢"],
  );
});

test("食材一覧: 仕込み品タブは0件でも表示する(そこから仕込み品を追加できるように)", () => {
  const chips = buildCategoryChips([{ categoryId: null, isPrepItem: false }], [], { includePrepTab: true });
  assert.deepEqual(chips.find((c) => c.label === "仕込み品")?.count, 0);
});

test("絞り込み: カテゴリのタブはそのカテゴリの項目だけ、未分類タブはカテゴリなしの項目だけ", () => {
  assert.deepEqual(
    filterByCategoryTab(menus, { type: "category", categoryId: "c-main" }, categories).map((m) => m.name),
    ["唐揚げ", "焼き魚定食"],
  );
  assert.deepEqual(filterByCategoryTab(menus, { type: "uncategorized" }, categories).map((m) => m.name), ["まかない"]);
  assert.equal(filterByCategoryTab(menus, { type: "all" }, categories).length, 4);
});

test("絞り込み: 一覧に無いカテゴリID(別の種類のカテゴリ等)を指している項目は未分類として扱う", () => {
  const items = [{ name: "謎", categoryId: "c-unknown" }];
  assert.equal(filterByCategoryTab(items, { type: "uncategorized" }, categories).length, 1);
  assert.equal(buildCategoryChips(items, categories, { includePrepTab: false }).find((c) => c.label === "未分類")?.count, 1);
});

test("URLのタブ指定: カテゴリID・未分類・仕込み品を読み取り、不明な値は「すべて」にする", () => {
  assert.deepEqual(parseCategoryTab("c-main", categories, { allowPrepTab: false }), { type: "category", categoryId: "c-main" });
  assert.deepEqual(parseCategoryTab("uncategorized", categories, { allowPrepTab: false }), { type: "uncategorized" });
  assert.deepEqual(parseCategoryTab("prep", categories, { allowPrepTab: true }), { type: "prep" });
  assert.deepEqual(parseCategoryTab("prep", categories, { allowPrepTab: false }), { type: "all" });
  assert.deepEqual(parseCategoryTab("deleted-id", categories, { allowPrepTab: false }), { type: "all" });
  assert.deepEqual(parseCategoryTab(undefined, categories, { allowPrepTab: false }), { type: "all" });
});

test("新規追加の初期値: カテゴリのタブならそのカテゴリ、それ以外(すべて・未分類・仕込み品)は未分類", () => {
  assert.equal(initialCategoryIdForNewItem({ type: "category", categoryId: "c-main" }), "c-main");
  assert.equal(initialCategoryIdForNewItem({ type: "all" }), null);
  assert.equal(initialCategoryIdForNewItem({ type: "uncategorized" }), null);
  assert.equal(initialCategoryIdForNewItem({ type: "prep" }), null);
});

test("カテゴリ名: 空欄・長すぎる名前・同じ種類の中での重複(表記ゆれ含む)を弾く", () => {
  assert.equal(validateCategoryName("  ", categories), "カテゴリ名を入力してください");
  assert.match(validateCategoryName("あ".repeat(21), categories) ?? "", /20文字以内/);
  assert.equal(validateCategoryName("メイン", categories), "同じ名前のカテゴリがすでにあります");
  assert.equal(validateCategoryName("前菜一品", categories), "同じ名前のカテゴリがすでにあります");
  assert.equal(validateCategoryName(" ﾒｲﾝ ", categories), "同じ名前のカテゴリがすでにあります");
  assert.equal(validateCategoryName("〆", categories), null);
});

test("カテゴリ名: 名前変更で自分自身の名前のままにするのは重複扱いしない", () => {
  assert.equal(validateCategoryName("メイン", categories, "c-main"), null);
  assert.equal(validateCategoryName("ドリンク", categories, "c-main"), "同じ名前のカテゴリがすでにあります");
});

test("並び替え: 1つ上に動かすと隣と入れ替わり、変わった行だけが返る", () => {
  // 現在の並び: 前菜・一品(1) / メイン(2) / ドリンク(3)
  assert.deepEqual(computeMovedSortOrders(categories, "c-drink", "up"), [
    { id: "c-drink", sortOrder: 2 },
    { id: "c-main", sortOrder: 3 },
  ]);
  assert.deepEqual(computeMovedSortOrders(categories, "c-starter", "down"), [
    { id: "c-main", sortOrder: 1 },
    { id: "c-starter", sortOrder: 2 },
  ]);
});

test("並び替え: 先頭をさらに上・末尾をさらに下には動かせない(何も変えない)", () => {
  assert.deepEqual(computeMovedSortOrders(categories, "c-starter", "up"), []);
  assert.deepEqual(computeMovedSortOrders(categories, "c-drink", "down"), []);
  assert.deepEqual(computeMovedSortOrders(categories, "c-unknown", "up"), []);
});

test("並び替え: 並び順の値が飛び飛び・重複していても、1から振り直して正しく入れ替わる", () => {
  const messy: Category[] = [
    { id: "a", kind: "menu", name: "A", sortOrder: 5 },
    { id: "b", kind: "menu", name: "B", sortOrder: 5 },
    { id: "c", kind: "menu", name: "C", sortOrder: 9 },
  ];
  const changes = computeMovedSortOrders(messy, "c", "up");
  const after = messy
    .map((c) => ({ ...c, sortOrder: changes.find((x) => x.id === c.id)?.sortOrder ?? c.sortOrder }))
    .sort((x, y) => x.sortOrder - y.sortOrder)
    .map((c) => c.id);
  assert.deepEqual(after, ["a", "c", "b"]);
});

test("追加: 新しいカテゴリは末尾(今の最大の並び順+1)に入る", () => {
  assert.equal(nextSortOrder(categories), 4);
  assert.equal(nextSortOrder([]), 1);
});
