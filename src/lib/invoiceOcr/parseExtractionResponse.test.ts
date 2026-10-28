import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtractionResponse } from "./parseExtractionResponse.ts";

test("parseExtractionResponse: 正常なJSON配列を読み取れる", () => {
  const raw = JSON.stringify([
    { name: "豚肉", quantity: 1000, unit: "g", unitPrice: 2.5, totalAmount: 2500, lowConfidence: false, note: null },
    { name: "玉ねぎ", quantity: 5, unit: "kg", unitPrice: null, totalAmount: 1000, lowConfidence: true, note: "数字が薄くて判読しづらい" },
  ]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "豚肉");
  assert.equal(result.items[0].unitPrice, 2.5);
  assert.equal(result.items[1].lowConfidence, true);
  assert.equal(result.items[1].note, "数字が薄くて判読しづらい");
});

test("parseExtractionResponse: Markdownのコードフェンスで囲まれていても読み取れる", () => {
  const raw = "```json\n" + JSON.stringify([{ name: "醤油", quantity: 1, unit: "本" }]) + "\n```";
  const result = parseExtractionResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "醤油");
});

test("parseExtractionResponse: JSONとして解析できない応答はエラーを返す", () => {
  const result = parseExtractionResponse("すみません、この画像は読み取れませんでした。");
  assert.equal(result.items.length, 0);
  assert.ok(result.error);
});

test("parseExtractionResponse: 食材名が無い行だけ読み飛ばし、他は候補に残す", () => {
  const raw = JSON.stringify([{ name: "" }, { name: "味噌", quantity: 1, unit: "kg" }]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "味噌");
});

test("parseExtractionResponse: 数値が文字列(カンマ・円マーク付き)で来ても数値に変換する", () => {
  const raw = JSON.stringify([{ name: "米", quantity: "10", unit: "kg", unitPrice: "¥350", totalAmount: "3,500" }]);
  const result = parseExtractionResponse(raw);
  assert.equal(result.items[0].quantity, 10);
  assert.equal(result.items[0].unitPrice, 350);
  assert.equal(result.items[0].totalAmount, 3500);
});

// ---------- 納品書全体の情報(設計の2・3段目、2026-10-28。P-1〜P-4はMahiroが確認する) ----------
// 税込・税抜の判定と、二度読みに気づくために、品目の一覧に加えて「日付・仕入れ先・合計金額・税の記載」も読み取る。

test("P-1 新しい形({ invoice, items })を読み取れる。金額の「12,960」も数にする", () => {
  const raw = JSON.stringify({
    invoice: { date: "2026-10-20", supplier: "(株)山田青果", totalAmount: "12,960", taxBasis: "exclusive" },
    items: [{ name: "玉ねぎ", quantity: 20, unit: "個", unitPrice: null, totalAmount: 1100, taxRate: 8, lowConfidence: false, note: null }],
  });
  const r = parseExtractionResponse(raw);
  assert.equal(r.error, null);
  assert.deepEqual(r.invoice, { date: "2026-10-20", supplier: "(株)山田青果", totalAmount: 12960, taxBasis: "exclusive" });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].taxRate, 8);
});

test("P-2 古い形(品目の配列だけ)でも読める。納品書全体の情報はすべて不明(null)", () => {
  const r = parseExtractionResponse(JSON.stringify([{ name: "醤油", quantity: 1, unit: "本" }]));
  assert.equal(r.error, null);
  assert.deepEqual(r.invoice, { date: null, supplier: null, totalAmount: null, taxBasis: null });
  assert.equal(r.items[0].taxRate, null);
});

test("P-3 税の記載は inclusive・exclusive だけ受け付ける(ほかは不明)。日付は 2026-10-20・2026/10/20 を受け付け、ほかは不明", () => {
  const meta = (invoice: Record<string, unknown>) => parseExtractionResponse(JSON.stringify({ invoice, items: [] })).invoice;
  assert.equal(meta({ taxBasis: "inclusive" }).taxBasis, "inclusive");
  assert.equal(meta({ taxBasis: "税抜" }).taxBasis, null);
  assert.equal(meta({ taxBasis: "unknown" }).taxBasis, null);
  assert.equal(meta({ date: "2026/10/20" }).date, "2026-10-20");
  assert.equal(meta({ date: "2026-2-3" }).date, "2026-02-03");
  assert.equal(meta({ date: "R8.10.20" }).date, null);
  assert.equal(meta({ date: "2026-13-01" }).date, null); // 13月は無い
  assert.equal(meta({ supplier: "  " }).supplier, null);
});

test("P-4 品目の税率は 8・10 だけ受け付ける(ほかは不明 = 画面では8%として扱う)", () => {
  const rate = (taxRate: unknown) => parseExtractionResponse(JSON.stringify({ items: [{ name: "清酒", taxRate }] })).items[0].taxRate;
  assert.equal(rate(10), 10);
  assert.equal(rate("8"), 8);
  assert.equal(rate(5), null);
  assert.equal(rate(null), null);
});

test("P-5 ページごとの日付・仕入れ先(pages)を読み取れる。無ければ空。おかしな行は飛ばす(2026-10-28)", () => {
  const r = parseExtractionResponse(
    JSON.stringify({
      invoice: { date: "2026-10-20" },
      pages: [
        { page: 1, date: "2026-10-20", supplier: "山田青果" },
        { page: "2", date: "2026/10/21", supplier: " " },
        "壊れた行",
      ],
      items: [],
    }),
  );
  assert.deepEqual(r.pages, [
    { page: 1, date: "2026-10-20", supplier: "山田青果" },
    { page: 2, date: "2026-10-21", supplier: null },
  ]);
  assert.deepEqual(parseExtractionResponse(JSON.stringify({ items: [] })).pages, []);
  assert.deepEqual(parseExtractionResponse("[]").pages, []);
});
