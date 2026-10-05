"use client";

import { SearchablePicker } from "@/components/SearchablePicker.tsx";
import type { Category } from "@/lib/categories";

/** SearchablePickerは値が文字列のため、「未分類(null)」をこの値で表す。 */
const UNCATEGORIZED_VALUE = "";

/**
 * メニュー・食材の編集画面のカテゴリ欄(任意)。
 * アプリ内の他の選択UIと同じ、検索絞り込みつきの選択リスト(SearchablePicker)を使う。
 * 先頭の選択肢は「未分類」。
 */
export function CategoryPickerField({
  categories,
  value,
  onChange,
}: {
  /** 同じ種類(メニュー用 or 食材用)のカテゴリ(並び順どおり)。 */
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
}) {
  // 選択中のカテゴリが一覧に無い(別の画面で削除された等)場合は、未分類として表示する。
  const knownValue = value != null && categories.some((c) => c.id === value) ? value : UNCATEGORIZED_VALUE;
  return (
    <div className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
      カテゴリ(任意)
      <SearchablePicker
        options={[{ value: UNCATEGORIZED_VALUE, label: "未分類" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        value={knownValue}
        onChange={(v) => onChange(v === UNCATEGORIZED_VALUE ? null : v)}
        searchPlaceholder="カテゴリ名で絞り込む"
        selectedLabelPrefix="選択中のカテゴリ"
        emptyLabel="未分類"
      />
    </div>
  );
}
