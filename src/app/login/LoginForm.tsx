"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

/**
 * Supabase Authが返す英語のエラーメッセージを、そのまま画面に出さず
 * よくあるケースだけ日本語に置き換える。該当しないものは原文のまま表示する
 * (完全な翻訳表よりは粗いが、代表的な失敗理由だけでも押さえておく)。
 */
function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (/user already registered/i.test(message)) {
    return "このメールアドレスはすでに登録されています。「ログイン」からお試しください。";
  }
  if (/email not confirmed/i.test(message)) {
    return "メールアドレスの確認が完了していません。届いた確認メール内のリンクを開いてから、もう一度ログインしてください。";
  }
  if (/password should be at least/i.test(message)) {
    return "パスワードは6文字以上で入力してください。";
  }
  if (/security purposes.*after/i.test(message) || /email rate limit exceeded/i.test(message)) {
    return "メール送信の回数制限に達しました。少し時間を空けてから、もう一度お試しください。";
  }
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createClient();

  if (!supabase) {
    return (
      <p className="mt-6 text-sm" style={{ color: "var(--status-danger)" }}>
        Supabaseが未設定のためログインできません。.env.localを確認してください。
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("パスワードが一致しません。もう一度入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        router.push("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase!.auth.signUp({ email, password });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setNotice("確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。");
          setMode("signin");
        }
      } else {
        // パスワード再設定メールの送信。存在しないメールアドレスでもエラーにしない
        // (登録済みかどうかをこの画面から探れないようにするSupabaseの既定挙動)。
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        setNotice("パスワード再設定用のメールを送信しました。メール内のリンクを開いて、新しいパスワードを設定してください。");
        setMode("signin");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      {mode !== "reset" && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="flex-1 rounded border px-3 py-2.5 transition-colors"
            style={
              mode === "signin"
                ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
                : { borderColor: "var(--border)", color: "var(--foreground)" }
            }
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className="flex-1 rounded border px-3 py-2.5 transition-colors"
            style={
              mode === "signup"
                ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
                : { borderColor: "var(--border)", color: "var(--foreground)" }
            }
          >
            新規登録
          </button>
        </div>
      )}

      {mode === "reset" && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
        </p>
      )}

      <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        メールアドレス
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
      </label>

      {mode !== "reset" && (
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          パスワード
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
        </label>
      )}

      {mode === "signup" && (
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          パスワード(確認)
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
        </label>
      )}

      {mode === "signin" && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setMode("reset");
          }}
          className="self-start text-sm underline underline-offset-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          パスワードをお忘れの場合
        </button>
      )}
      {mode === "reset" && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setMode("signin");
          }}
          className="self-start text-sm underline underline-offset-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          ログインに戻る
        </button>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm" style={{ color: "var(--status-ok)" }}>
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {isSubmitting
          ? "処理中…"
          : mode === "signin"
            ? "ログイン"
            : mode === "signup"
              ? "登録する"
              : "再設定メールを送る"}
      </button>
    </form>
  );
}
