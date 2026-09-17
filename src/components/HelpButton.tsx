"use client";

import { useEffect, useState } from "react";

/**
 * 画面の見出しや機能の近くに置く「?」ヘルプボタン。
 *
 * 各画面に常時表示されている説明文(「今この画面で何が起きているか」)とは
 * 役割を分け、こちらは「そもそもこれは何のための機能か」という、必要な時にだけ
 * 開いて読む粒度の違う説明を載せる。押すとモーダルで説明文を表示するだけの、
 * 状態を持たない小さな共通コンポーネント。
 */
export function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`「${title}」のヘルプを開く`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors hover:bg-[color:var(--muted)]"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <button aria-label="閉じる" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="relative z-10 w-full max-w-md rounded-t-lg border p-6 sm:rounded-lg"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-base font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
                {title}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded px-2 py-1 text-sm underline underline-offset-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                閉じる
              </button>
            </div>
            <div className="text-sm leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
