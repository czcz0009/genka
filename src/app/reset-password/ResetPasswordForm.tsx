"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// w-full: 配布前QAで発見。入力欄に幅を明示しないと、スマホ幅で入力欄がはみ出す不具合が
// あったため付与する(他画面の同名定数と同じ修正)。
const INPUT_CLASS = "w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";
const inputStyle = { background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" };

/**
 * パスワード再設定リンクから開かれる画面。
 *
 * メール内のリンクをクリックすると、Supabaseが「パスワード再設定専用の
 * 一時的なセッション」をURLに付けてこのページへ戻す。@supabase/ssrの
 * ブラウザクライアントは読み込み時にそれを自動検出してセッションを確立する
 * (このアプリの新規登録確認メールと同じ仕組み・サーバー側のコールバック
 * ルートは不要)。そのため、ここでは「セッションがあるか」を確認するだけでよい。
 */
export function ResetPasswordForm() {
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) {
      // setStateをエフェクト内で同期呼び出ししないため、マイクロタスクに逃がす
      Promise.resolve().then(() => setChecking(false));
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session);
      setChecking(false);
    });
  }, [supabase]);

  if (!supabase) {
    return (
      <p className="mt-6 text-sm" style={{ color: "var(--status-danger)" }}>
        Supabaseが未設定のため利用できません。
      </p>
    );
  }

  if (checking) {
    return (
      <p className="mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
        確認中…
      </p>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          リンクが無効か、有効期限が切れています。もう一度ログイン画面から「パスワードをお忘れの場合」をお試しください。
        </p>
        <Link href="/login" className="text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
          ログイン画面に戻る
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm" style={{ color: "var(--status-ok)" }}>
          パスワードを更新しました。
        </p>
        <Link href="/" className="text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
          トップページへ
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("パスワードが一致しません。もう一度入力してください。");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) {
        setError(/should be at least/i.test(error.message) ? "パスワードは6文字以上で入力してください。" : error.message);
        return;
      }
      setDone(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        新しいパスワード
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
          style={inputStyle}
        />
      </label>
      <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        新しいパスワード(確認)
        <input
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={INPUT_CLASS}
          style={inputStyle}
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {isSubmitting ? "更新中…" : "パスワードを更新する"}
      </button>
    </form>
  );
}
