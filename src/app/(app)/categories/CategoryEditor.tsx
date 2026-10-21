"use client";

import { useState } from "react";
import {
  CATEGORY_DUPLICATE_NOTE,
  MAX_CATEGORY_NAME_LENGTH,
  isDuplicateCategoryError,
  validateCategoryName,
  type Category,
  type CategoryKind,
} from "@/lib/categories";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { createCategory, renameCategory } from "./actions.ts";

const inputStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
  fontFamily: "var(--font-noto-sans-jp)",
};
const INPUT_CLASS = "w-full min-w-0 rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";
const SUB_BUTTON_CLASS = "shrink-0 whitespace-nowrap rounded border px-3 py-2 text-sm transition-colors disabled:opacity-50";
const subButtonStyle: React.CSSProperties = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

/**
 * カテゴリ名のエラー表示。名前の重複のときは、1行目に重なった既存のカテゴリ名、
 * 2行目に小さい文字で「同じ名前とみなす範囲」を出す(スマホでも読みやすいよう2行に分ける)。
 */
export function CategoryNameError({ message }: { message: string }) {
  if (!isDuplicateCategoryError(message)) return <ActionErrorMessage error={message} />;
  return (
    <div role="alert">
      <p className="text-sm" style={{ color: "var(--status-danger)" }}>
        {message}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {CATEGORY_DUPLICATE_NOTE}
      </p>
    </div>
  );
}

function NameCounter({ name }: { name: string }) {
  const length = name.trim().length;
  return (
    <span className="shrink-0 font-mono text-xs" style={{ color: length > MAX_CATEGORY_NAME_LENGTH ? "var(--status-danger)" : "var(--muted-foreground)" }}>
      {length}/{MAX_CATEGORY_NAME_LENGTH}
    </span>
  );
}

/** 入力中の名前の、保存前のエラー(空欄のうちは出さない)。 */
function liveNameError(name: string, categories: Category[], excludeId?: string): string | null {
  if (!name.trim()) return null;
  return validateCategoryName(name, categories, excludeId);
}

export function CategoryEditor({
  storeId,
  kind,
  unit,
  initialCategories,
  initialCounts,
}: {
  storeId: string;
  kind: CategoryKind;
  /** 件数の単位(メニューは「品」、食材は「件」) */
  unit: string;
  initialCategories: Category[];
  initialCounts: Record<string, number>;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const newNameError = liveNameError(newName, categories);
  const editNameError = editingId ? liveNameError(editName, categories, editingId) : null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const error = validateCategoryName(newName, categories);
    if (error) {
      setAddError(error);
      return;
    }
    setAdding(true);
    setAddError(null);
    const result = await createCategory({ storeId, kind, name: newName });
    setAdding(false);
    if (!result.success) {
      setAddError(result.error);
      return;
    }
    setCategories(result.categories);
    setNewName("");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditError(null);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const error = validateCategoryName(editName, categories, editingId);
    if (error) {
      setEditError(error);
      return;
    }
    setSaving(true);
    setEditError(null);
    const result = await renameCategory({ storeId, kind, categoryId: editingId, name: editName });
    setSaving(false);
    if (!result.success) {
      setEditError(result.error);
      return;
    }
    setCategories(result.categories);
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {categories.length === 0 && (
          <li className="px-4 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
            カテゴリはまだありません。下から追加できます。
          </li>
        )}
        {categories.map((category) => (
          <li key={category.id} className="px-4 py-3" style={{ borderColor: "var(--border)" }}>
            {editingId === category.id ? (
              <form onSubmit={handleRename} className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="カテゴリ名"
                    autoFocus
                    className={INPUT_CLASS}
                    style={inputStyle}
                  />
                  <NameCounter name={editName} />
                </div>
                {(editNameError ?? editError) && <CategoryNameError message={(editNameError ?? editError)!} />}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={saving || editNameError != null || !editName.trim()}
                    className="rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={SUB_BUTTON_CLASS} style={subButtonStyle}>
                    やめる
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]"
                  style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
                >
                  {category.name}
                </span>
                <span className="shrink-0 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {initialCounts[category.id] ?? 0}
                  {unit}
                </span>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(category)} className={SUB_BUTTON_CLASS} style={subButtonStyle}>
                    名前を変える
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="space-y-2 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <label className="block text-sm font-semibold" style={{ color: "var(--foreground)" }} htmlFor="new-category-name">
          新しいカテゴリ
        </label>
        <div className="flex items-center gap-2">
          <input
            id="new-category-name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setAddError(null);
            }}
            placeholder="例: 季節限定"
            className={INPUT_CLASS}
            style={inputStyle}
          />
          <NameCounter name={newName} />
        </div>
        {(newNameError ?? addError) && <CategoryNameError message={(newNameError ?? addError)!} />}
        <button
          type="submit"
          disabled={adding || newNameError != null || !newName.trim()}
          className="rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {adding ? "追加中…" : "追加する"}
        </button>
      </form>
    </div>
  );
}
