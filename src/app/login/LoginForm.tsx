"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createClient();

  if (!supabase) {
    return (
      <p className="mt-6 text-sm text-red-600 dark:text-red-400">
        Supabaseが未設定のためログインできません。.env.localを確認してください。
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
          return;
        }
        router.push("/import");
        router.refresh();
      } else {
        const { data, error } = await supabase!.auth.signUp({ email, password });
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          router.push("/import");
          router.refresh();
        } else {
          setNotice("確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。");
          setMode("signin");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-full px-3 py-1 ${mode === "signin" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-full px-3 py-1 ${mode === "signup" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}
        >
          新規登録
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        メールアドレス
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        パスワード
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {mode === "signin" ? "ログイン" : "登録する"}
      </button>
    </form>
  );
}
