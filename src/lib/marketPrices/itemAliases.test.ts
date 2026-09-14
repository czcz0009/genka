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

test("配布前の食材辞書拡充で追加した表記ゆれが正しい品目コードに登録されている", () => {
  // 実データ(fixtures/26073h_syuyo.csv)の品目コードに基づく追加分の確認
  assert.ok(ITEM_ALIASES["31900"]?.includes("青ねぎ")); // 長ねぎ系だけでなく青ねぎ系の表記も
  assert.ok(ITEM_ALIASES["31900"]?.includes("万能ねぎ"));
  assert.ok(ITEM_ALIASES["38500"]?.includes("ぶなしめじ")); // 市販パッケージの主流表記
  assert.ok(ITEM_ALIASES["41480"]?.includes("デコポン")); // 農水省の正式名「しらぬひ」とは別名
  // 実えんどう(35300)は農水省データには存在するが辞書が未登録だった品目
  assert.ok(ITEM_ALIASES["35300"]?.includes("グリーンピース"));
  assert.ok(ITEM_ALIASES["36200"]?.includes("ポテト"));
  assert.ok(ITEM_ALIASES["36700"]?.includes("ガーリック"));
  assert.ok(ITEM_ALIASES["36500"]?.includes("大和芋"));
  assert.ok(ITEM_ALIASES["36100"]?.includes("紅はるか"));
  // ひらがな・漢字表記のみだった一部の品目にカタカナ表記を追加
  assert.ok(ITEM_ALIASES["30100"]?.includes("ダイコン"));
  assert.ok(ITEM_ALIASES["30300"]?.includes("ニンジン"));
  assert.ok(ITEM_ALIASES["30400"]?.includes("ゴボウ"));
  assert.ok(ITEM_ALIASES["30200"]?.includes("カブ"));
  assert.ok(ITEM_ALIASES["36300"]?.includes("サトイモ"));
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
