import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, DISPLAY_NAMES } from "./shunpoNames.ts";

// 旬報の表示名(2026-10-27)。農林水産省の統計の品目名を、店主になじみのある呼び方に直して表示する。
// 最初は、10月上旬・10月中旬の下書きに出た野菜(選ばれた品目と、外れた品目)から。期待値はMahiroが確認する。
test("H-1 統計の名前 → なじみのある呼び方", () => {
  assert.deepEqual(
    ["セルリー", "ちんげんさい", "こまつな", "みずな", "はくさい", "ほうれんそう", "しゅんぎく", "さやいんげん", "スイートコーン", "さやえんどう"].map(displayName),
    ["セロリ", "チンゲン菜", "小松菜", "水菜", "白菜", "ほうれん草", "春菊", "いんげん", "とうもろこし", "絹さや"],
  );
});
test("H-2 対応表に無い品目は、統計の名前のまま(キャベツ・ピーマン・きゅうり・レタス・カリフラワー・ねぎ・ブロッコリー・ふき・たけのこ)", () => {
  for (const n of ["キャベツ", "ピーマン", "きゅうり", "レタス", "カリフラワー", "ねぎ", "ブロッコリー", "ふき", "たけのこ"]) assert.equal(displayName(n), n);
});
test("H-3 対応表の呼び方は、ほかの品目の統計の名前と重ならない(取り違えを防ぐ)", () => {
  const officials = new Set(Object.keys(DISPLAY_NAMES));
  for (const v of Object.values(DISPLAY_NAMES)) assert.ok(!officials.has(v), v);
});
