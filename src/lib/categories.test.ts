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
  countItemsByCategory,
  isDuplicateCategoryError,
  CATEGORY_DUPLICATE_NOTE,
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
  assert.equal(validateCategoryName("メイン", categories), "同じ名前のカテゴリがすでにあります(「メイン」)。");
  assert.equal(validateCategoryName("前菜一品", categories), "同じ名前のカテゴリがすでにあります(「前菜・一品」)。");
  assert.equal(validateCategoryName(" ﾒｲﾝ ", categories), "同じ名前のカテゴリがすでにあります(「メイン」)。");
  assert.equal(validateCategoryName("〆", categories), null);
});

test("カテゴリ名: 名前変更で自分自身の名前のままにするのは重複扱いしない", () => {
  assert.equal(validateCategoryName("メイン", categories, "c-main"), null);
  assert.equal(validateCategoryName("ドリンク", categories, "c-main"), "同じ名前のカテゴリがすでにあります(「ドリンク」)。");
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

// ── カテゴリの編集画面の件数(2026-10-21、期待値はMahiroが検算済み) ──
// 編集画面の件数は、メニュー一覧・食材一覧のタブの数字と同じ数え方(filterByCategoryTab)にする。
// 検算: 編集画面の件数の合計 + 未分類(+ 食材は仕込み品)= すべて。

test("M-1〜M-5 メニュー: 編集画面の件数がタブの数字と一致し、合計+未分類=すべて", () => {
  const menuCategories: Category[] = [
    { id: "m-starter", kind: "menu", name: "前菜・一品", sortOrder: 1 },
    { id: "m-main", kind: "menu", name: "メイン", sortOrder: 2 },
    { id: "m-drink", kind: "menu", name: "ドリンク", sortOrder: 3 },
  ];
  const menus = [
    { categoryId: "m-starter" },
    { categoryId: "m-starter" },
    { categoryId: "m-starter" },
    { categoryId: "m-main" },
    { categoryId: "m-main" },
    { categoryId: null },
    { categoryId: null },
    // 存在しないカテゴリを指す1品。DBではカテゴリを削除するとcategory_idが自動で空に戻る
    // (on delete set null)ため、保存されたデータでは起きない。画面に古いデータが残っている場合
    // (2つのタブで開いていて、片方でカテゴリを削除した場合など)に起こりうる状態への、防御的な扱い。
    // この場合は「未分類」として数え、どのカテゴリの件数にも入れない。
    { categoryId: "m-deleted" },
  ];
  const counts = countItemsByCategory(menus, menuCategories);
  const chips = buildCategoryChips(menus, menuCategories, { includePrepTab: false });
  const chipCount = (param: string | null) => chips.find((c) => c.param === param)?.count;

  assert.equal(counts.get("m-starter"), 3); // M-1
  assert.equal(counts.get("m-main"), 2); // M-2
  assert.equal(counts.get("m-drink"), 0); // M-3
  for (const c of menuCategories) assert.equal(counts.get(c.id), chipCount(c.id), c.name); // タブの数字と一致
  assert.equal(chipCount("uncategorized"), 3); // M-4(空2品 + 存在しないカテゴリを指す1品)
  assert.equal(chipCount(null), 8); // M-5 すべて
  assert.equal(3 + 2 + 0 + 3, 8);
});

test("I-1〜I-6 食材: 仕込み品はどのカテゴリの件数にも入れず(DB上でカテゴリが付いていても)、合計+仕込み品+未分類=すべて", () => {
  const ingredientCategories: Category[] = [
    { id: "i-veg", kind: "ingredient", name: "野菜", sortOrder: 1 },
    { id: "i-meat", kind: "ingredient", name: "肉", sortOrder: 2 },
    { id: "i-season", kind: "ingredient", name: "調味料", sortOrder: 3 },
  ];
  const ingredients = [
    { categoryId: "i-veg", isPrepItem: false },
    { categoryId: "i-veg", isPrepItem: false },
    { categoryId: "i-veg", isPrepItem: false },
    { categoryId: "i-veg", isPrepItem: false },
    { categoryId: "i-meat", isPrepItem: false },
    { categoryId: "i-meat", isPrepItem: false },
    { categoryId: null, isPrepItem: false },
    { categoryId: null, isPrepItem: false },
    { categoryId: null, isPrepItem: true },
    { categoryId: "i-veg", isPrepItem: true }, // 古いデータ等でDB上は「野菜」が付いている仕込み品
  ];
  const counts = countItemsByCategory(ingredients, ingredientCategories);
  const chips = buildCategoryChips(ingredients, ingredientCategories, { includePrepTab: true });
  const chipCount = (param: string | null) => chips.find((c) => c.param === param)?.count;

  assert.equal(counts.get("i-veg"), 4); // I-1(仕込み品は数えない)
  assert.equal(counts.get("i-meat"), 2); // I-2
  assert.equal(counts.get("i-season"), 0); // I-3
  for (const c of ingredientCategories) assert.equal(counts.get(c.id), chipCount(c.id), c.name); // タブの数字と一致
  assert.equal(chipCount("prep"), 2); // I-4
  assert.equal(chipCount("uncategorized"), 2); // I-5
  assert.equal(chipCount(null), 10); // I-6 すべて
  assert.equal(4 + 2 + 0 + 2 + 2, 10);
});

test("名前の重複エラー: 1行目は重なった既存のカテゴリ名つき、2行目の注記で同じとみなす範囲を説明する", () => {
  const message = validateCategoryName("ﾄﾞﾘﾝｸ", categories) ?? "";
  assert.equal(message, "同じ名前のカテゴリがすでにあります(「ドリンク」)。");
  assert.equal(isDuplicateCategoryError(message), true);
  assert.equal(isDuplicateCategoryError("カテゴリ名を入力してください"), false);
  // DBの一意制約で弾かれた場合(ほぼ同時の操作)の文言も、重複として扱う
  assert.equal(isDuplicateCategoryError("カテゴリの追加に失敗しました: 同じ名前のカテゴリがすでにあります。"), true);
  assert.equal(CATEGORY_DUPLICATE_NOTE, "全角・半角、大文字・小文字、スペース、「・」などの記号や括弧の違いは、同じ名前とみなします。");
  // 注記どおりの範囲を、実際に同じ名前とみなしていること
  for (const variant of ["ドリンク", " ドリンク ", "ドリ ンク", "ドリ・ンク", "(ドリンク)"]) {
    assert.ok(isDuplicateCategoryError(validateCategoryName(variant, categories) ?? ""), variant);
  }
  const withLatin: Category[] = [{ id: "c-bbq", kind: "menu", name: "BBQ", sortOrder: 1 }];
  assert.ok(isDuplicateCategoryError(validateCategoryName("ｂｂｑ", withLatin) ?? ""));
});
