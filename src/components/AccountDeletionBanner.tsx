"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelAccountDeletion } from "@/app/(app)/settings/accountDeletionActions.ts";

/**
 * 退会の申請中に、全画面共通で表示するバナー。
 * 猶予期間中は普段どおりアプリを使えるが、常にこのバナーで気づけるようにする。
 */
export function AccountDeletionBanner({ daysRemaining }: { daysRemaining: number }) {
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCanceling(true);
    setError(null);
    const result = await cancelAccountDeletion();
    setCanceling(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
      style={{ background: "var(--status-danger)", color: "white", fontFamily: "var(--font-noto-sans-jp)" }}
    >
      <span>
        退会の申請中です。あと{daysRemaining}日で、店舗データを含むすべてのデータが削除されます。
      </span>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs">{error}</span>}
        <button
          type="button"
          onClick={handleCancel}
          disabled={canceling}
          className="shrink-0 rounded border border-white px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {canceling ? "処理中…" : "退会を取り消す"}
        </button>
      </div>
    </div>
  );
}
