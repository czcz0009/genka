import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlertDigestRow, selectTopAlerts } from "./dashboardAlertDigest.ts";

// ダッシュボード「前回から変わったこと」の仕入れ値の行(2026-10-21、期待値はMahiroが検算済み)。
// 点の色: 値上がり=赤(up)、値下がり=青(down)。アラート画面と同じ。30%の区切りは廃止。
// 色だけに頼らないよう、見出しに「値上がり」「値下がり」の言葉が必ず入ることも確認する。

test("4-1 キャベツ +45.3%(影響メニュー2つ): 赤、値上がり", () => {
  const row = buildAlertDigestRow({ ingredientName: "キャベツ", changePercent: 45.3, direction: "up", affectedMenuNames: ["生姜焼き定食", "野菜炒め定食"] });
  assert.deepEqual(row, {
    tone: "up",
    title: "キャベツが値上がりしています",
    description: "変動率 +45.3%　影響メニュー: 生姜焼き定食、野菜炒め定食",
  });
});

test("4-2 豚こま肉 +12.0%: 30%未満でも赤(以前は黄)、値上がり", () => {
  const row = buildAlertDigestRow({ ingredientName: "豚こま肉", changePercent: 12, direction: "up", affectedMenuNames: ["生姜焼き定食"] });
  assert.deepEqual(row, { tone: "up", title: "豚こま肉が値上がりしています", description: "変動率 +12.0%　影響メニュー: 生姜焼き定食" });
});

test("4-3 鶏もも肉 −35.0%: 青(以前は赤)、値下がり", () => {
  const row = buildAlertDigestRow({ ingredientName: "鶏もも肉", changePercent: -35, direction: "down", affectedMenuNames: ["唐揚げ定食"] });
  assert.deepEqual(row, { tone: "down", title: "鶏もも肉が値下がりしています", description: "変動率 -35.0%　影響メニュー: 唐揚げ定食" });
});

test("4-4 たまねぎ −12.0%(影響メニューなし): 青(以前は黄)、値下がり、説明は変動率だけ", () => {
  const row = buildAlertDigestRow({ ingredientName: "たまねぎ", changePercent: -12, direction: "down", affectedMenuNames: [] });
  assert.deepEqual(row, { tone: "down", title: "たまねぎが値下がりしています", description: "変動率 -12.0%" });
});

test("4-5 以前の境界 +30.0% / −30.0%: 赤 / 青", () => {
  const up = buildAlertDigestRow({ ingredientName: "にんじん", changePercent: 30, direction: "up", affectedMenuNames: [] });
  const down = buildAlertDigestRow({ ingredientName: "にんじん", changePercent: -30, direction: "down", affectedMenuNames: [] });
  assert.equal(up.tone, "up");
  assert.ok(up.title.includes("値上がり"));
  assert.equal(down.tone, "down");
  assert.ok(down.title.includes("値下がり"));
});

test("4-6 3件(+45.3%、−35.0%、+12.0%)のとき: 変動幅の大きい2件(+45.3%は赤、−35.0%は青)を表示(選び方は変わらない)", () => {
  const alerts = [
    { ingredientName: "豚こま肉", changePercent: 12, direction: "up" as const, affectedMenuNames: [] },
    { ingredientName: "鶏もも肉", changePercent: -35, direction: "down" as const, affectedMenuNames: [] },
    { ingredientName: "キャベツ", changePercent: 45.3, direction: "up" as const, affectedMenuNames: [] },
  ];
  const rows = selectTopAlerts(alerts).map(buildAlertDigestRow);
  assert.deepEqual(
    rows.map((r) => [r.title, r.tone]),
    [
      ["キャベツが値上がりしています", "up"],
      ["鶏もも肉が値下がりしています", "down"],
    ],
  );
});

test("見出しには、どの変動率・向きでも「値上がり」か「値下がり」のどちらかが必ず入る", () => {
  for (const [changePercent, direction] of [[0.1, "up"], [99.9, "up"], [-0.1, "down"], [-99.9, "down"]] as const) {
    const row = buildAlertDigestRow({ ingredientName: "食材", changePercent, direction, affectedMenuNames: [] });
    assert.ok(row.title.includes(direction === "up" ? "値上がり" : "値下がり"), row.title);
  }
});
