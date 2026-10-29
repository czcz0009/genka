/**
 * パスワードの最低の文字数(2026-10-29、バックログA-2。テストは password.test.ts)。
 * 新規登録・パスワードの再設定は8文字以上。ログインは文字数で断らない
 * (以前は6文字から登録できたため、6〜7文字で登録済みの人が今までどおり入れるように。Mahiro了承)。
 * Supabase側の最低の文字数も、アプリのデプロイ後にMahiroが8に変える。
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = `${PASSWORD_MIN_LENGTH}文字以上で入力してください`;
export const PASSWORD_TOO_SHORT_MESSAGE = `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`;

export function passwordLengthError(password: string, mode: "signup" | "reset" | "login"): string | null {
  if (mode === "login") return null;
  return password.length < PASSWORD_MIN_LENGTH ? PASSWORD_TOO_SHORT_MESSAGE : null;
}
