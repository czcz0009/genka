/**
 * ログイン画面(新規登録・ログイン・パスワードの再設定)の画像認証(Cloudflare Turnstile)と、認証のエラーの言い換え(2026-10-28)。
 * テストは captcha.test.ts。画面の部品は src/components/TurnstileWidget.tsx。
 *
 * - サイトキー(公開してよい値)は NEXT_PUBLIC_TURNSTILE_SITE_KEY。本番はCloudflareで作ったキー、手元はCloudflare公式の
 *   テスト用のキー(1x00000000000000000000AA = 必ず通る)。未設定なら画像認証は出さない(今までどおり)。
 * - 画像認証の結果(トークン)は、Supabaseに captchaToken として渡す。Supabase側でオンにすると、結果が無い・偽物の要求は断られる。
 * - シークレットキーはアプリには置かない(Supabaseの管理画面だけに入れる)。
 */

import { PASSWORD_TOO_SHORT_MESSAGE } from "./password.ts";

export const CAPTCHA_FAILED_MESSAGE = "画像認証を確認できませんでした。画像認証をやり直してから、もう一度お試しください。";
export const CAPTCHA_LOAD_FAILED_MESSAGE =
  "画像認証を読み込めませんでした。通信の状態を確かめて、ページを読み込み直してください。それでも表示されない場合は、時間をおいてお試しください。";
export const CAPTCHA_WAIT_MESSAGE = "画像認証が終わるまでお待ちください(「人間であることを確認します」の表示が消えたら、もう一度押してください)。";
const GENERIC_AUTH_ERROR = "処理に失敗しました。時間をおいて、もう一度お試しください。";

/** Supabaseに渡す追加の項目(画像認証の結果があるときだけ) */
export function captchaOptions(token: string | null): { captchaToken?: string } {
  return token ? { captchaToken: token } : {};
}

/**
 * 送る前の確認: 画像認証が有効で、まだ結果が無ければ、案内を返して送らない。
 * 画像認証を読み込めなかったときは、画面を止めないよう送る(Supabase側でオンなら断られ、その案内が出る)。
 */
export function submitBlockedByCaptcha(s: { enabled: boolean; token: string | null; loadFailed: boolean; failed?: boolean }): string | null {
  if (!s.enabled || s.loadFailed || s.token) return null;
  return s.failed ? CAPTCHA_FAILED_MESSAGE : CAPTCHA_WAIT_MESSAGE;
}

/** Supabase Authの英語のエラーを、日本語の案内に言い換える。想定していないものも原文は出さない(2026-10-29、パスワードの再設定の画面も同じものを使う) */
export function translateAuthError(message: string): string {
  if (/captcha/i.test(message)) return CAPTCHA_FAILED_MESSAGE;
  if (/invalid login credentials/i.test(message)) return "メールアドレスまたはパスワードが正しくありません。";
  if (/user already registered/i.test(message)) return "このメールアドレスはすでに登録されています。「ログイン」からお試しください。";
  if (/email not confirmed/i.test(message)) {
    return "メールアドレスの確認が完了していません。届いた確認メール内のリンクを開いてから、もう一度ログインしてください。";
  }
  // パスワードが短い: Supabaseの設定の数字に関係なく、アプリの決まり(8文字)で案内する(2026-10-29)
  if (/password should be at least \d+/i.test(message)) return PASSWORD_TOO_SHORT_MESSAGE;
  if (/should be different from the old password/i.test(message)) return "今のパスワードと違うパスワードを入力してください。";
  if (/known to be weak|easy to guess|pwned/i.test(message)) return "このパスワードは推測されやすいため使えません。別のパスワードにしてください。";
  if (/password should contain at least one character/i.test(message)) {
    return "パスワードに、英字の小文字・大文字・数字をそれぞれ1文字以上入れてください。";
  }
  if (/auth session missing/i.test(message)) {
    return "ログインの有効期限が切れました。もう一度ログイン画面から「パスワードをお忘れの場合」をお試しください。";
  }
  if (/unable to validate email address|email address .* is invalid|invalid format/i.test(message)) {
    return "メールアドレスの形が正しくありません。もう一度確かめてください。";
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return "通信に失敗しました。電波の状態を確かめて、もう一度お試しください。";
  }
  if (/security purposes.*after/i.test(message) || /email rate limit exceeded/i.test(message)) {
    return "メール送信の回数制限に達しました。少し時間を空けてから、もう一度お試しください。";
  }
  return GENERIC_AUTH_ERROR;
}
