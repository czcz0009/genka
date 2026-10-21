"use client";

import { useState } from "react";
import {
  CATEGORY_DUPLICATE_NOTE,
  MAX_CATEGORY_NAME_LENGTH,
  categoryDeleteConfirmMessage,
  isDuplicateCategoryError,
  validateCategoryName,
  type Category,
  type CategoryKind,
} from "@/lib/categories";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { Modal } from "@/components/Modal.tsx";
import { createCategory, deleteCategory, moveCategory, renameCategory } from "./actions.ts";

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
  /** 並び替え・削除の処理中のカテゴリ(二重押し防止) */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

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

  // 並び替えは「1つ上へ」「1つ下へ」のボタンで行う(スマホでの誤操作を避けるため、ドラッグは使わない)
  async function handleMove(category: Category, direction: "up" | "down") {
    setBusyId(category.id);
    setListError(null);
    const result = await moveCategory({ storeId, kind, categoryId: category.id, direction });
    setBusyId(null);
    if (!result.success) {
      setListError(result.error);
      return;
    }
    setCategories(result.categories);
  }

  async function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    setBusyId(target.id);
    setListError(null);
    const result = await deleteCategory({ storeId, kind, categoryId: target.id });
    setBusyId(null);
    setDeleting(null);
    if (!result.success) {
      setListError(result.error);
      return;
    }
    setCategories(result.categories);
    if (editingId === target.id) setEditingId(null);
  }

  return (
    <div className="space-y-4">
      {listError && <ActionErrorMessage error={listError} />}
      <ul className="divide-y rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {categories.length === 0 && (
          <li className="px-4 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
            カテゴリはまだありません。下から追加できます。
          </li>
        )}
        {categories.map((category, index) => (
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
                {/* max-w-full: 320pxでは4つのボタンが1行に収まらないため、行の幅の中で折り返す */}
                <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleMove(category, "up")}
                    disabled={index === 0 || busyId != null}
                    aria-label={`「${category.name}」を1つ上へ`}
                    className={SUB_BUTTON_CLASS}
                    style={subButtonStyle}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(category, "down")}
                    disabled={index === categories.length - 1 || busyId != null}
                    aria-label={`「${category.name}」を1つ下へ`}
                    className={SUB_BUTTON_CLASS}
                    style={subButtonStyle}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => startEdit(category)} className={SUB_BUTTON_CLASS} style={subButtonStyle}>
                    名前を変える
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    disabled={busyId != null}
                    className={SUB_BUTTON_CLASS}
                    style={{ ...subButtonStyle, color: "var(--status-danger)" }}
                  >
                    削除
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

      {deleting && (
        <Modal title="カテゴリの削除" onClose={() => setDeleting(null)}>
          <p className="text-sm [overflow-wrap:anywhere]" style={{ color: "var(--foreground)" }}>
            {categoryDeleteConfirmMessage(deleting.name, initialCounts[deleting.id] ?? 0, kind)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busyId != null}
              className="rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--status-danger)", color: "white" }}
            >
              {busyId === deleting.id ? "削除中…" : "削除する"}
            </button>
            <button type="button" onClick={() => setDeleting(null)} className={SUB_BUTTON_CLASS} style={subButtonStyle}>
              やめる
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
