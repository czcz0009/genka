/**
 * ユーザーが確認・修正した最終マッピングを実データに適用し、
 * 「メニュー × 食材リスト」の構造に組み立てる。
 *
 * ここでの目的は2つ:
 * 1. 行単位のバリデーション(必須項目の欠落・数値として読めない値)をエラーとして
 *    洗い出す(取り込み確定前にユーザーへ提示するため)
 * 2. 同一食材・同一メニューの重複行をまとめる(表記ゆれは normalizeForDedupe で吸収)
 */
import type { FieldId } from "./fields.ts";
import { parseNumericJa } from "./numeric.ts";
import { normalizeDisplayName, normalizeForDedupe } from "../normalize.ts";

/** フィールドごとの列インデックス。未割り当ては null。 */
export type FinalMapping = Partial<Record<FieldId, number | null>>;

export interface ImportRow {
  /** スプレッドシート上の行番号(ヘッダー行=1として、人が読んでわかる番号) */
  sheetRow: number;
  menuName: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  purchasePrice: number | null;
  sellingPrice: number | null;
}

export interface ImportRowError {
  sheetRow: number;
  message: string;
}

/**
 * メニュー名がExcelの結合セル由来で空欄だった行に、直前行の値を引き継いだ記録。
 * 「本当にメニュー名が未入力なだけの行」と区別するための情報として、
 * 引き継ぎ元の行番号も持たせる。
 */
export interface MenuNameFill {
  sheetRow: number;
  menuName: string;
  filledFromSheetRow: number;
}

export interface ApplyMappingResult {
  rows: ImportRow[];
  errors: ImportRowError[];
  menuNameFills: MenuNameFill[];
}

function cell(row: string[], columnIndex: number | null | undefined): string {
  if (columnIndex == null) return "";
  return (row[columnIndex] ?? "").trim();
}

export function applyMapping(rows: string[][], mapping: FinalMapping): ApplyMappingResult {
  const out: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const menuNameFills: MenuNameFill[] = [];

  // Excelでメニュー名セルを複数のレシピ行にまたがって結合している場合、
  // 結合範囲の先頭行以外は空文字として読み込まれる。これを「メニュー名が空の
  // エラー行」として弾くのではなく、直前に実際に入力されていた値を引き継ぐ
  // (forward-fill)。対象は識別用の「メニュー名」列だけに限定し、分量・単位・
  // 仕入単価・売価などの数値/金額列には絶対に適用しない
  // (誤って引き継ぐと原価計算そのものが狂うため)。
  let lastMenuName: string | null = null;
  let lastMenuNameSheetRow: number | null = null;

  rows.forEach((row, i) => {
    const sheetRow = i + 2; // 1行目はヘッダーなのでデータは2行目から
    const isBlank = row.every((c) => (c ?? "").trim() === "");
    if (isBlank) {
      // 空行はメニューの区切りとみなし、引き継ぎをリセットする
      // (「引き継ぎ忘れ」を「別メニューの引き継ぎ漏れ」まで拡大しないため)
      lastMenuName = null;
      lastMenuNameSheetRow = null;
      return;
    }

    const menuNameCell = cell(row, mapping.menuName);
    const ingredientNameRaw = cell(row, mapping.ingredientName);
    const quantityRaw = cell(row, mapping.quantity);
    const unitRaw = cell(row, mapping.unit);
    const purchasePriceRaw = cell(row, mapping.purchasePrice);
    const sellingPriceRaw = cell(row, mapping.sellingPrice);

    let menuName = "";
    if (menuNameCell) {
      menuName = normalizeDisplayName(menuNameCell);
      lastMenuName = menuName;
      lastMenuNameSheetRow = sheetRow;
    } else if (lastMenuName != null && lastMenuNameSheetRow != null) {
      menuName = lastMenuName;
      menuNameFills.push({ sheetRow, menuName, filledFromSheetRow: lastMenuNameSheetRow });
    }

    const missing: string[] = [];
    if (!menuName) missing.push("メニュー名");
    if (!ingredientNameRaw) missing.push("食材名");
    if (!quantityRaw) missing.push("分量");
    if (!unitRaw) missing.push("単位");
    if (missing.length > 0) {
      errors.push({ sheetRow, message: `${missing.join("・")} が空です` });
      return;
    }

    const quantity = parseNumericJa(quantityRaw);
    if (quantity === null || quantity <= 0) {
      errors.push({ sheetRow, message: `分量「${quantityRaw}」が数値として読み取れません` });
      return;
    }

    const purchasePrice = purchasePriceRaw ? parseNumericJa(purchasePriceRaw) : null;
    if (purchasePriceRaw && purchasePrice === null) {
      errors.push({ sheetRow, message: `仕入単価「${purchasePriceRaw}」が数値として読み取れません` });
    }
    const sellingPrice = sellingPriceRaw ? parseNumericJa(sellingPriceRaw) : null;
    if (sellingPriceRaw && sellingPrice === null) {
      errors.push({ sheetRow, message: `売価「${sellingPriceRaw}」が数値として読み取れません` });
    }

    out.push({
      sheetRow,
      menuName,
      ingredientName: normalizeDisplayName(ingredientNameRaw),
      quantity,
      unit: unitRaw,
      purchasePrice,
      sellingPrice,
    });
  });

  return { rows: out, errors, menuNameFills };
}

export interface PlannedIngredient {
  name: string;
  normalizedName: string;
  unit: string;
  /** 取り込み行の中で最後に見つかった仕入単価(未指定なら null) */
  purchasePrice: number | null;
  /** 同じ食材名なのに単位や単価が食い違う行があった場合の警告 */
  conflicts: string[];
}

export interface PlannedMenuIngredient {
  ingredientNormalizedName: string;
  quantity: number;
  unit: string;
}

export interface PlannedMenu {
  name: string;
  normalizedName: string;
  sellingPrice: number | null;
  ingredients: PlannedMenuIngredient[];
}

export interface ImportPlan {
  menus: PlannedMenu[];
  ingredients: PlannedIngredient[];
}

/** 取り込み行を「メニュー一覧」「食材一覧(重複排除済み)」に組み立てる */
export function buildImportPlan(rows: ImportRow[]): ImportPlan {
  const menus = new Map<string, PlannedMenu>();
  const ingredients = new Map<string, PlannedIngredient>();

  for (const row of rows) {
    const menuKey = normalizeForDedupe(row.menuName);
    let menu = menus.get(menuKey);
    if (!menu) {
      menu = {
        name: row.menuName,
        normalizedName: menuKey,
        sellingPrice: row.sellingPrice,
        ingredients: [],
      };
      menus.set(menuKey, menu);
    } else if (menu.sellingPrice == null && row.sellingPrice != null) {
      menu.sellingPrice = row.sellingPrice;
    }

    const ingredientKey = normalizeForDedupe(row.ingredientName);
    let ingredient = ingredients.get(ingredientKey);
    if (!ingredient) {
      ingredient = {
        name: row.ingredientName,
        normalizedName: ingredientKey,
        unit: row.unit,
        purchasePrice: row.purchasePrice,
        conflicts: [],
      };
      ingredients.set(ingredientKey, ingredient);
    } else {
      if (ingredient.unit !== row.unit) {
        ingredient.conflicts.push(
          `単位が「${ingredient.unit}」と「${row.unit}」で食い違っています(${row.sheetRow}行目)`,
        );
      }
      if (
        row.purchasePrice != null &&
        ingredient.purchasePrice != null &&
        row.purchasePrice !== ingredient.purchasePrice
      ) {
        ingredient.conflicts.push(
          `仕入単価が「${ingredient.purchasePrice}」と「${row.purchasePrice}」で食い違っています(${row.sheetRow}行目)`,
        );
      }
      if (ingredient.purchasePrice == null && row.purchasePrice != null) {
        ingredient.purchasePrice = row.purchasePrice;
      }
    }

    menu.ingredients.push({
      ingredientNormalizedName: ingredientKey,
      quantity: row.quantity,
      unit: row.unit,
    });
  }

  return {
    menus: Array.from(menus.values()),
    ingredients: Array.from(ingredients.values()),
  };
}
