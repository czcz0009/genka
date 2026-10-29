import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PASSWORD_MIN_LENGTH, passwordLengthError, PASSWORD_HINT } from "./password.ts";

// パスワードの最低の文字数を8文字に(2026-10-29、バックログA-2)。期待値W-1〜W-4はMahiroが確認する。
const src = (...p: string[]) => readFileSync(join(process.cwd(), "src", ...p), "utf8");

test("W-1 最低の文字数は8文字。案内の文言", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_HINT, "8文字以上で入力してください");
});

test("W-2 新規登録・パスワードの再設定: 7文字は断る、8文字は通す", () => {
  for (const mode of ["signup", "reset"] as const) {
    assert.equal(passwordLengthError("1234567", mode), "パスワードは8文字以上で入力してください。");
    assert.equal(passwordLengthError("12345678", mode), null);
  }
});

test("W-3 ログイン: 文字数では断らない(6〜7文字で登録済みの人が、今までどおり入れるように)", () => {
  assert.equal(passwordLengthError("123456", "login"), null);
});

test("W-4 画面に「6文字」の決め打ちと minLength={6} が残っていない", () => {
  for (const f of [src("app", "login", "LoginForm.tsx"), src("app", "reset-password", "ResetPasswordForm.tsx")]) {
    assert.doesNotMatch(f, /minLength=\{6\}/);
    assert.doesNotMatch(f, /6文字/);
  }
});

// 2026-10-29(バックログA-1): DBの英語のエラー(内部の名前を含みうる)を、画面に出す文に埋め込まない
test("E-1 退会・同意・取り込みの保存・パスワードの再設定で、英語のエラー(error.message)を画面に出さない", () => {
  const files = [
    src("app", "(app)", "settings", "accountDeletionActions.ts"),
    src("app", "consentActions.ts"),
    src("app", "(app)", "import", "actions.ts"),
    src("app", "reset-password", "ResetPasswordForm.tsx"),
  ];
  for (const f of files) {
    assert.doesNotMatch(f, /\$\{[^}]*error\??\.message[^}]*\}/);
    assert.doesNotMatch(f, /:\s*error\.message\)/);
  }
});
