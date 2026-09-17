"use client";

import { useEffect } from "react";

/**
 * 画面共通のモーダル(スマホ幅では下からのシート、それ以上では中央ダイアログ)。
 * HelpButtonの説明モーダルと、食材追加フォームのモーダル化の両方で使う共通の器。
 * 開閉の状態自体は持たず、表示するかどうか(呼び出し側の条件分岐)と
 * 中身(children)だけを受け取る。
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button aria-label="閉じる" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-lg border p-6 sm:rounded-lg"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-base font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
            {title}
          </p>
          <button
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm underline underline-offset-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
