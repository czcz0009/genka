"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordTermsConsent } from "@/app/consentActions.ts";

/**
 * 既存ユーザーが、まだ現在のバージョンの利用規約・プライバシーポリシーに
 * 同意していない場合に、通常の画面の代わりに表示する同意画面。
 * (app)/layout.tsxが、規約のバージョンと本人の同意記録を比べて表示要否を判定する。
 */
export function ConsentGate() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAgree() {
    setSubmitting(true);
    setError(null);
    const result = await recordTermsConsent();
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6" style={{ background: "var(--background)" }}>
      <div
        className="w-full max-w-md rounded border p-6"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <h1 className="text-xl font-bold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          規約を整備したので、確認をお願いします
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          利用規約とプライバシーポリシーの内容にご同意いただくと、引き続きお使いいただけます。
        </p>
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <Link href="/terms" target="_blank" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            利用規約を読む →
          </Link>
          <Link href="/privacy" target="_blank" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            プライバシーポリシーを読む →
          </Link>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm" style={{ color: "var(--foreground)" }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>利用規約とプライバシーポリシーに同意する</span>
        </label>
        {error && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-danger)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleAgree}
          disabled={!agreed || submitting}
          className="mt-4 w-full rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          {submitting ? "処理中…" : "同意して続ける"}
        </button>
      </div>
    </div>
  );
}
