import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captchaOptions,
  translateAuthError,
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_LOAD_FAILED_MESSAGE,
  CAPTCHA_WAIT_MESSAGE,
  submitBlockedByCaptcha,
} from "./captcha.ts";

// ログイン画面の画像認証(Cloudflare Turnstile、2026-10-28)。期待値T-1〜T-7はMahiroが確認する。

test("T-1 画像認証の結果があれば、Supabaseに渡す(captchaToken)。無ければ何も足さない", () => {
  assert.deepEqual(captchaOptions("tok-123"), { captchaToken: "tok-123" });
  assert.deepEqual(captchaOptions(null), {});
  assert.deepEqual(captchaOptions(""), {});
});

test("T-2 画像認証に関するSupabaseのエラーは、日本語の案内にする", () => {
  assert.equal(translateAuthError("captcha verification process failed"), CAPTCHA_FAILED_MESSAGE);
  assert.equal(translateAuthError("captcha protection: request disallowed (no captcha response)"), CAPTCHA_FAILED_MESSAGE);
  assert.equal(CAPTCHA_FAILED_MESSAGE, "画像認証を確認できませんでした。画像認証をやり直してから、もう一度お試しください。");
});

test("T-3 画像認証を読み込めなかったときの案内", () => {
  assert.equal(
    CAPTCHA_LOAD_FAILED_MESSAGE,
    "画像認証を読み込めませんでした。通信の状態を確かめて、ページを読み込み直してください。それでも表示されない場合は、時間をおいてお試しください。",
  );
});

test("T-4 画像認証が終わる前に押した → 案内を出して送らない。読み込めなかったときは止めずに送る(サーバー側で判断)", () => {
  assert.equal(submitBlockedByCaptcha({ enabled: true, token: null, loadFailed: false }), CAPTCHA_WAIT_MESSAGE);
  assert.equal(submitBlockedByCaptcha({ enabled: true, token: "t", loadFailed: false }), null);
  assert.equal(submitBlockedByCaptcha({ enabled: true, token: null, loadFailed: true }), null);
  assert.equal(submitBlockedByCaptcha({ enabled: false, token: null, loadFailed: false }), null);
  // 画像認証が失敗したあとに押した → 「やり直してください」の案内(待つ案内ではない)
  assert.equal(submitBlockedByCaptcha({ enabled: true, token: null, loadFailed: false, failed: true }), CAPTCHA_FAILED_MESSAGE);
  assert.equal(CAPTCHA_WAIT_MESSAGE, "画像認証が終わるまでお待ちください(「人間であることを確認します」の表示が消えたら、もう一度押してください)。");
});

test("T-5 これまでの日本語の言い換えは、そのまま", () => {
  assert.equal(translateAuthError("Invalid login credentials"), "メールアドレスまたはパスワードが正しくありません。");
  assert.equal(translateAuthError("User already registered"), "このメールアドレスはすでに登録されています。「ログイン」からお試しください。");
  assert.equal(translateAuthError("Email not confirmed"), "メールアドレスの確認が完了していません。届いた確認メール内のリンクを開いてから、もう一度ログインしてください。");
  assert.equal(translateAuthError("Email rate limit exceeded"), "メール送信の回数制限に達しました。少し時間を空けてから、もう一度お試しください。");
});

test("T-6 想定していない英語のエラーは、原文を出さず、日本語の案内にする(点検13番)", () => {
  assert.equal(translateAuthError("Database error saving new user"), "処理に失敗しました。時間をおいて、もう一度お試しください。");
});

test("T-7 パスワードが短いというエラーは、Supabaseの設定の数字に関係なく「8文字以上」と案内する(2026-10-29、Mahiroの指示)", () => {
  assert.equal(translateAuthError("Password should be at least 6 characters."), "パスワードは8文字以上で入力してください。");
  assert.equal(translateAuthError("Password should be at least 8 characters."), "パスワードは8文字以上で入力してください。");
});

// 2026-10-29(バックログA-1): Supabaseの英語のエラーを、日本語の案内に言い換える(パスワードの再設定の画面も同じ言い換えを使う)
test("T-8 パスワードの再設定・登録で返りうる英語のエラー", () => {
  assert.equal(translateAuthError("New password should be different from the old password."), "今のパスワードと違うパスワードを入力してください。");
  assert.equal(
    translateAuthError("Password is known to be weak and easy to guess, please choose a different one."),
    "このパスワードは推測されやすいため使えません。別のパスワードにしてください。",
  );
  assert.equal(
    translateAuthError("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789"),
    "パスワードに、英字の小文字・大文字・数字をそれぞれ1文字以上入れてください。",
  );
  assert.equal(
    translateAuthError("Auth session missing!"),
    "ログインの有効期限が切れました。もう一度ログイン画面から「パスワードをお忘れの場合」をお試しください。",
  );
});

test("T-9 メールアドレスの形のエラー", () => {
  assert.equal(translateAuthError("Unable to validate email address: invalid format"), "メールアドレスの形が正しくありません。もう一度確かめてください。");
  assert.equal(translateAuthError('Email address "a@b" is invalid'), "メールアドレスの形が正しくありません。もう一度確かめてください。");
});

test("T-10 通信の失敗(Failed to fetch 等)", () => {
  assert.equal(translateAuthError("Failed to fetch"), "通信に失敗しました。電波の状態を確かめて、もう一度お試しください。");
  assert.equal(translateAuthError("NetworkError when attempting to fetch resource."), "通信に失敗しました。電波の状態を確かめて、もう一度お試しください。");
});
