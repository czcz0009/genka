import { test } from "node:test";
import assert from "node:assert/strict";
import { isAlreadyRegisteredSignUp } from "./signUpResult.ts";

test("登録済みのメールアドレス(identitiesが空配列)は「登録済み」と判定する", () => {
  assert.equal(isAlreadyRegisteredSignUp({ identities: [] }), true);
});

test("本当に新規登録できた場合(identitiesが1件)は「登録済み」と判定しない", () => {
  assert.equal(isAlreadyRegisteredSignUp({ identities: [{ provider: "email" }] }), false);
});

test("ユーザー情報が無い・identitiesが無い場合は「登録済み」と判定しない(通常の流れに任せる)", () => {
  assert.equal(isAlreadyRegisteredSignUp(null), false);
  assert.equal(isAlreadyRegisteredSignUp(undefined), false);
  assert.equal(isAlreadyRegisteredSignUp({}), false);
  assert.equal(isAlreadyRegisteredSignUp({ identities: null }), false);
});
