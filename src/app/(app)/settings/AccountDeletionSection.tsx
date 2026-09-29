"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAccountDeletion, cancelAccountDeletion } from "./accountDeletionActions.ts";
import { DELETE_CONFIRMATION_TEXT } from "@/lib/accountDeletion.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";

/**
 * 退会(アカウント削除)の申請セクション。目立たない場所(設定画面の一番下)に置く。
 * 誤操作防止のため、確認文字列(「退会する」)の入力と一致しない限りボタンを押せない。
 */
export function AccountDeletionSection({ hasPendingDeletion }: { hasPendingDeletion: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    setSubmitting(true);
    setError(null);
    const result = await requestAccountDeletion(confirmText);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    const result = await cancelAccountDeletion();
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (hasPendingDeletion) {
    return (
      <div className="mt-10 rounded border p-4" style={{ borderColor: "var(--status-danger)" }}>
        <p className="text-sm" style={{ color: "var(--foreground)" }}>
          退会を申請中です。画面上部のバナーからいつでも取り消せます。
        </p>
        {error && <ActionErrorMessage error={error} />}
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="mt-2 rounded border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          {submitting ? "処理中…" : "退会を取り消す"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 border-t pt-6" style={{ borderColor: "var(--border)" }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs underline underline-offset-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          退会(アカウントを削除する)
        </button>
      ) : (
        <div className="rounded border p-4" style={{ borderColor: "var(--status-danger)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            退会すると、店舗・メニュー・食材・売上記録など、すべてのデータが削除されます
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            申請してから30日間は取り消せます。30日後、自動的に削除されます(30日の間はいつもどおり利用できます)。
          </p>
          <label className="mt-3 flex flex-col gap-1 text-sm" style={{ color: "var(--foreground)" }}>
            確認のため「{DELETE_CONFIRMATION_TEXT}」と入力してください
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full max-w-xs rounded border px-3 py-2 text-base"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </label>
          {error && <ActionErrorMessage error={error} />}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={handleRequest}
              disabled={submitting || confirmText !== DELETE_CONFIRMATION_TEXT}
              className="rounded px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: "var(--status-danger)" }}
            >
              {submitting ? "処理中…" : "退会を申請する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError(null);
              }}
              className="rounded border px-4 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
