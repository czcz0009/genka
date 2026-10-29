"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordTermsConsent } from "../consentActions.ts";
import { isAlreadyRegisteredSignUp, ALREADY_REGISTERED_MESSAGE } from "@/lib/signUpResult.ts";
import { TurnstileWidget } from "@/components/TurnstileWidget.tsx";
import {
  captchaOptions,
  submitBlockedByCaptcha,
  translateAuthError,
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_LOAD_FAILED_MESSAGE,
} from "@/lib/auth/captcha.ts";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, passwordLengthError } from "@/lib/auth/password.ts";

/** 画像認証のサイトキー(公開してよい値)。未設定なら画像認証を出さない(src/lib/auth/captcha.ts) */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Mode = "signin" | "signup" | "reset";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 画像認証(2026-10-28)。結果は1回きりなので、送るたびに作り直す(captchaKey を変える)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captchaEnabled = TURNSTILE_SITE_KEY !== "";

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaFailed(false);
    setCaptchaKey((k) => k + 1);
  }

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

    // 新規登録は8文字以上(ログインは文字数で断らない。password.ts)
    const lengthError = mode === "signup" ? passwordLengthError(password, "signup") : null;
    if (lengthError) {
      setError(lengthError);
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("パスワードが一致しません。もう一度入力してください。");
      return;
    }
    if (mode === "signup" && !agreedToTerms) {
      setError("利用規約とプライバシーポリシーへの同意が必要です。");
      return;
    }

    const blocked = submitBlockedByCaptcha({ enabled: captchaEnabled, token: captchaToken, loadFailed: captchaLoadFailed, failed: captchaFailed });
    if (blocked) {
      setError(blocked);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase!.auth.signInWithPassword({ email, password, options: captchaOptions(captchaToken) });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        router.push("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase!.auth.signUp({ email, password, options: captchaOptions(captchaToken) });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        // 登録済みのメールアドレスだった場合、Supabaseはエラーを返さないため
        // (詳細は signUpResult.ts)、ここで見分けてログインへ案内する。
        if (isAlreadyRegisteredSignUp(data.user)) {
          setError(ALREADY_REGISTERED_MESSAGE);
          return;
        }
        if (data.session) {
          // メール確認が不要な設定の場合はここで既にログイン済みのため、
          // 同意を記録できる。確認メールが必要な設定の場合はセッションが
          // まだ無く記録できないが、その場合も次回ログイン時に
          // ConsentGateが未同意を検知して再度同意を求めるため、
          // ここでの記録失敗は無視してよい(取りこぼしても後で必ず拾える)。
          void recordTermsConsent();
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
          ...captchaOptions(captchaToken),
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
      if (captchaEnabled) resetCaptcha();
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
          className="w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
      </label>

      {mode !== "reset" && (
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          パスワード
          <input
            type="password"
            required
            minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          {mode === "signup" && (
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {PASSWORD_HINT}
            </span>
          )}
        </label>
      )}

      {mode === "signup" && (
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          パスワード(確認)
          <input
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
        </label>
      )}

      {mode === "signup" && (
        <label className="flex items-start gap-2 text-sm" style={{ color: "var(--foreground)" }}>
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <Link href="/terms" target="_blank" className="underline underline-offset-2">
              利用規約
            </Link>
            と
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">
              プライバシーポリシー
            </Link>
            に同意する
          </span>
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

      {captchaEnabled && (
        <div className="flex min-w-0 flex-col gap-2">
          <TurnstileWidget
            key={captchaKey}
            siteKey={TURNSTILE_SITE_KEY}
            onToken={(t) => {
              setCaptchaToken(t);
              setCaptchaFailed(false);
            }}
            onExpire={() => setCaptchaToken(null)}
            onError={() => {
              setCaptchaToken(null);
              setCaptchaFailed(true);
            }}
            onLoadError={() => setCaptchaLoadFailed(true)}
          />
          {captchaLoadFailed && (
            <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--status-danger)" }}>
              <p>{CAPTCHA_LOAD_FAILED_MESSAGE}</p>
              <button type="button" onClick={() => window.location.reload()} className="self-start underline underline-offset-2">
                ページを読み込み直す
              </button>
            </div>
          )}
          {captchaFailed && (
            <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--status-danger)" }}>
              <p>{CAPTCHA_FAILED_MESSAGE}</p>
              <button type="button" onClick={resetCaptcha} className="self-start underline underline-offset-2">
                画像認証をやり直す
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || (mode === "signup" && !agreedToTerms)}
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
