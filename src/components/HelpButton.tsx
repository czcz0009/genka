"use client";

import { useState } from "react";
import { Modal } from "./Modal.tsx";

/**
 * 画面の見出しや機能の近くに置く「?」ヘルプボタン。
 *
 * 各画面に常時表示されている説明文(「今この画面で何が起きているか」)とは
 * 役割を分け、こちらは「そもそもこれは何のための機能か」という、必要な時にだけ
 * 開いて読む粒度の違う説明を載せる。押すと共通のModalで説明文を表示するだけの、
 * 状態を持たない小さな共通コンポーネント。
 */
export function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

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
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="text-sm leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            {children}
          </div>
        </Modal>
      )}
    </>
  );
}
