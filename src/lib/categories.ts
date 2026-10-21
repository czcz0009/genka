import { normalizeForDedupe } from "./normalize.ts";

/**
 * メニュー・食材のカテゴリ(タブ)分けの純粋ロジック。
 *
 * カテゴリは整理用の任意機能で、原価計算・FL比率等の計算には一切関わらない
 * (計算関数にはcategoryIdを渡さない。categoryInvariance.test.tsで確認している)。
 *
 * タブの種類:
 * - すべて
 * - 各カテゴリ(categoriesテーブルの行)
 * - 仕込み品(食材一覧だけの固定タブ。仕込み品にはカテゴリを付けず、ここで別枠表示する)
 * - 未分類(カテゴリが付いていない項目。0件なら表示しない)
 */

export type CategoryKind = "menu" | "ingredient";

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  sortOrder: number;
}

/** カテゴリ名の文字数上限。タブ(チップ)に収まる長さにする。 */
export const MAX_CATEGORY_NAME_LENGTH = 20;

/** URLの ?category= に入れる、カテゴリID以外の固定値。 */
export const UNCATEGORIZED_TAB_PARAM = "uncategorized";
export const PREP_TAB_PARAM = "prep";

export type CategoryTab =
  | { type: "all" }
  | { type: "category"; categoryId: string }
  | { type: "prep" }
  | { type: "uncategorized" };

/** タブで絞り込む対象(メニュー・食材)に必要な項目。 */
export interface CategorizableItem {
  categoryId: string | null;
  /** 食材一覧のみ。trueなら仕込み品(カテゴリのタブではなく「仕込み品」タブに出す)。 */
  isPrepItem?: boolean;
}

export interface CategoryChip {
  /** URLの ?category= に入れる値。「すべて」はnull(パラメータなし)。 */
  param: string | null;
  label: string;
  count: number;
  tab: CategoryTab;
}

/** 並び順(sortOrder)の昇順に並べる。同じ値なら元の順番を保つ。 */
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * URLの ?category= の値をタブに変換する。
 * 存在しないカテゴリID(削除済み・別の種類のカテゴリ等)や、食材一覧以外での
 * 「仕込み品」は「すべて」として扱う(画面を開けなくなるのを避けるため)。
 */
export function parseCategoryTab(
  param: string | null | undefined,
  categories: Category[],
  options: { allowPrepTab: boolean },
): CategoryTab {
  if (!param) return { type: "all" };
  if (param === UNCATEGORIZED_TAB_PARAM) return { type: "uncategorized" };
  if (param === PREP_TAB_PARAM) return options.allowPrepTab ? { type: "prep" } : { type: "all" };
  if (categories.some((c) => c.id === param)) return { type: "category", categoryId: param };
  return { type: "all" };
}

export function categoryTabToParam(tab: CategoryTab): string | null {
  switch (tab.type) {
    case "all":
      return null;
    case "category":
      return tab.categoryId;
    case "prep":
      return PREP_TAB_PARAM;
    case "uncategorized":
      return UNCATEGORIZED_TAB_PARAM;
  }
}

/**
 * 項目がタブに含まれるかどうか。
 * カテゴリIDが一覧に無い(他の種類のカテゴリを指している等)項目は、未分類として扱う。
 */
export function matchesCategoryTab(item: CategorizableItem, tab: CategoryTab, categories: Category[]): boolean {
  if (tab.type === "all") return true;
  if (tab.type === "prep") return item.isPrepItem === true;
  if (item.isPrepItem) return false;
  const knownCategoryId = item.categoryId != null && categories.some((c) => c.id === item.categoryId);
  if (tab.type === "uncategorized") return !knownCategoryId;
  return knownCategoryId && item.categoryId === tab.categoryId;
}

export function filterByCategoryTab<T extends CategorizableItem>(items: T[], tab: CategoryTab, categories: Category[]): T[] {
  return items.filter((item) => matchesCategoryTab(item, tab, categories));
}

/**
 * タブ(チップ)の一覧を件数つきで組み立てる。
 * 並び: すべて / 各カテゴリ(並び順どおり) / 仕込み品(食材一覧のみ) / 未分類(0件なら出さない)。
 * 自分で作ったカテゴリは0件でも表示する(新しく作った直後に見えなくなるのを避けるため)。
 */
export function buildCategoryChips(
  items: CategorizableItem[],
  categories: Category[],
  options: { includePrepTab: boolean },
): CategoryChip[] {
  const count = (tab: CategoryTab) => filterByCategoryTab(items, tab, categories).length;
  const chips: CategoryChip[] = [{ param: null, label: "すべて", count: items.length, tab: { type: "all" } }];
  for (const c of sortCategories(categories)) {
    const tab: CategoryTab = { type: "category", categoryId: c.id };
    chips.push({ param: c.id, label: c.name, count: count(tab), tab });
  }
  if (options.includePrepTab) {
    const tab: CategoryTab = { type: "prep" };
    chips.push({ param: PREP_TAB_PARAM, label: "仕込み品", count: count(tab), tab });
  }
  const uncategorizedTab: CategoryTab = { type: "uncategorized" };
  const uncategorizedCount = count(uncategorizedTab);
  if (uncategorizedCount > 0) {
    chips.push({ param: UNCATEGORIZED_TAB_PARAM, label: "未分類", count: uncategorizedCount, tab: uncategorizedTab });
  }
  return chips;
}

/** 新規追加のとき、カテゴリ欄の初期値にするカテゴリID(カテゴリのタブを開いている時だけ)。 */
export function initialCategoryIdForNewItem(tab: CategoryTab): string | null {
  return tab.type === "category" ? tab.categoryId : null;
}

/**
 * カテゴリ名のチェック。問題なければnull、あればエラーメッセージを返す。
 * sameKindCategoriesには同じ種類(メニュー用 or 食材用)のカテゴリを渡す。
 * 名前変更のときは、自分自身(excludeId)は重複チェックから外す。
 */
export function validateCategoryName(
  rawName: string,
  sameKindCategories: Pick<Category, "id" | "name">[],
  excludeId?: string,
): string | null {
  const name = rawName.trim();
  if (!name) return "カテゴリ名を入力してください";
  if (name.length > MAX_CATEGORY_NAME_LENGTH) return `カテゴリ名は${MAX_CATEGORY_NAME_LENGTH}文字以内で入力してください`;
  const normalized = normalizeForDedupe(name);
  if (!normalized) return "カテゴリ名を入力してください";
  const duplicate = sameKindCategories.find((c) => c.id !== excludeId && normalizeForDedupe(c.name) === normalized);
  if (duplicate) return `${CATEGORY_DUPLICATE_PREFIX}(「${duplicate.name}」)。`;
  return null;
}

/** 名前の重複エラーの1行目の書き出し(DBの一意制約で弾かれた場合も、この書き出しで返す)。 */
export const CATEGORY_DUPLICATE_PREFIX = "同じ名前のカテゴリがすでにあります";
/**
 * 名前の重複エラーの2行目(小さい文字)。同じ名前とみなす範囲(normalizeForDedupe)を説明する。
 * 実際には全角・半角、大文字・小文字、スペース、「・」「、」「。」「,」「.」、括弧の違いを同じとみなしている。
 */
export const CATEGORY_DUPLICATE_NOTE = "全角・半角、大文字・小文字、スペース、「・」などの記号や括弧の違いは、同じ名前とみなします。";

export function isDuplicateCategoryError(message: string): boolean {
  return message.includes(CATEGORY_DUPLICATE_PREFIX);
}

/**
 * カテゴリごとの件数(カテゴリの編集画面に出す「◯品」「◯件」)。
 * メニュー一覧・食材一覧のタブの数字と必ず一致させるため、タブと同じ絞り込み(filterByCategoryTab)で数える。
 * 仕込み品はカテゴリのタブに出ないため、どのカテゴリの件数にも含まれない。
 */
export function countItemsByCategory(items: CategorizableItem[], categories: Category[]): Map<string, number> {
  return new Map(
    categories.map((c) => [c.id, filterByCategoryTab(items, { type: "category", categoryId: c.id }, categories).length]),
  );
}

/**
 * カテゴリを1つ上/下に動かしたときの、新しい並び順を計算する。
 * 全体を1から振り直し、値が変わる行だけを返す(端で動かせない場合は空配列)。
 */
export function computeMovedSortOrders(
  categories: Category[],
  categoryId: string,
  direction: "up" | "down",
): { id: string; sortOrder: number }[] {
  const sorted = sortCategories(categories);
  const index = sorted.findIndex((c) => c.id === categoryId);
  if (index === -1) return [];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) return [];
  const reordered = [...sorted];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered
    .map((c, i) => ({ id: c.id, sortOrder: i + 1, before: c.sortOrder }))
    .filter((c) => c.sortOrder !== c.before)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}

/** 新しく追加するカテゴリの並び順(末尾)。 */
export function nextSortOrder(sameKindCategories: Pick<Category, "sortOrder">[]): number {
  return sameKindCategories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
}

/**
 * カテゴリを削除する前の確認文言。中のメニュー・食材は削除されず「未分類」に戻る(DBの on delete set null)。
 * 件数が0のときは「中のメニューはありません」(食材なら「中の食材はありません」)。
 * 件数は編集画面と同じ数え方(countItemsByCategory。食材の仕込み品は含めない)。
 */
export function categoryDeleteConfirmMessage(name: string, count: number, kind: CategoryKind): string {
  const item = kind === "menu" ? "メニュー" : "食材";
  if (count === 0) return `「${name}」を削除します。中の${item}はありません`;
  const unit = kind === "menu" ? "品" : "件";
  return `「${name}」を削除します。このカテゴリの${item}${count}${unit}は「未分類」に戻ります(${item}自体は削除されません)`;
}
