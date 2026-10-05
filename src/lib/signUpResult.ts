/**
 * Supabaseのメール確認が有効な設定では、登録済み(確認済み)のメールアドレスで
 * signUpしてもエラーにならず、「登録を受け付けたように見える」ユーザー情報が返る
 * (第三者が登録の有無を探れないようにするSupabaseの仕様)。この場合、新しい
 * アカウントは作られず、確認メールも送られない。
 *
 * 見分け方: そのユーザー情報の identities(ログイン手段の一覧)が空配列になっている。
 * 本当に新規登録できた場合は、メール/パスワードのidentityが1件入っている。
 *
 * このサービスでは利用者が迷わないことを優先し、登録済みであることを明示する
 * (2026-10-05決定。登録の有無が第三者に分かるようになる点は許容した)。
 */
export function isAlreadyRegisteredSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

export const ALREADY_REGISTERED_MESSAGE =
  "このメールアドレスはすでに登録されています。「ログイン」からお試しください。パスワードを忘れた場合は、ログイン画面の「パスワードをお忘れの場合」から再設定できます。";
