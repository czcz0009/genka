import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEM_ALIASES } from "./itemAliases.ts";

test("追加した同義語(たけのこ・れんこん・なめこ等)が正しい品目コードに登録されている", () => {
  // 実データ(fixtures/26073h_syuyo.csv)の品目コードに基づく、優先度3で追加した分の確認
  assert.ok(ITEM_ALIASES["30500"]?.includes("たけのこ"));
  assert.ok(ITEM_ALIASES["30600"]?.includes("れんこん"));
  assert.ok(ITEM_ALIASES["31560"]?.includes("チンゲン菜"));
  assert.ok(ITEM_ALIASES["33100"]?.includes("アスパラガス"));
  assert.ok(ITEM_ALIASES["34600"]?.includes("ししとう"));
  assert.ok(ITEM_ALIASES["38300"]?.includes("なめこ")); // しいたけ以外のきのこ類
  assert.ok(ITEM_ALIASES["43500"]?.includes("柿"));
  assert.ok(ITEM_ALIASES["50800"]?.includes("キウイ"));
  // じゃがいも(一般名)は既存の「ばれいしょ」(農水省の正式名)と同じコードに紐付いている
  assert.ok(ITEM_ALIASES["36200"]?.includes("じゃがいも"));
  assert.ok(ITEM_ALIASES["36200"]?.includes("ばれいしょ"));
});

test("同じ同義語が複数の品目コードに重複登録されていない(あいまいなマッチを防ぐ)", () => {
  const seen = new Map<string, string>();
  for (const [code, aliases] of Object.entries(ITEM_ALIASES)) {
    for (const alias of aliases) {
      const existing = seen.get(alias);
      assert.ok(!existing, `"${alias}" が ${existing} と ${code} の両方に登録されている`);
      seen.set(alias, code);
    }
  }
});

test("品目コードはすべて数字のみの文字列", () => {
  for (const code of Object.keys(ITEM_ALIASES)) {
    assert.match(code, /^\d+$/);
  }
});
