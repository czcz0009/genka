import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectShunpoItems, buildXDraft, formatChange, formatYoy, xWeightedLength, tipLine, X_LIMIT, type ShunpoRow, type ShunpoItem } from "./shunpo.ts";

// 旬報の下書き(2026-10-26)。期待値S-1〜S-6はMahiroが確認する。
// 実データ: 2026年10月上旬と9月下旬(fixtures/shunpo-2026-10-1.json。DBから取り出した農林水産省の旬別結果)。
const fx = JSON.parse(readFileSync(new URL("./fixtures/shunpo-2026-10-1.json", import.meta.url), "utf8"));
const sel = selectShunpoItems(fx.current.rows, fx.previous.rows);
const view = (xs: { itemName: string; changePercent: number }[]) => xs.map((x) => `${x.itemName} ${x.changePercent.toFixed(1)}%`);

test("S-1 値上がり: キャベツ・ピーマン・きゅうり(変動率の大きい順。ピーマン14.4%ときゅうり14.0%は四捨五入すると同じ14%だが、四捨五入前の大きい順)", () => {
  assert.deepEqual(view(sel.up), ["キャベツ 42.6%", "ピーマン 14.4%", "きゅうり 14.0%"]);
});

test("S-2 値下がり: こまつな・みずな(しゅんぎく・さやえんどうは入荷量100トン未満で外れる)", () => {
  assert.deepEqual(view(sel.down), ["こまつな -17.0%", "みずな -11.6%"]);
});

test("S-3 外れた品目と理由(±10%以上動いたもの)", () => {
  const got = sel.excluded.map((x) => `${x.itemName} ${x.changePercent.toFixed(1)}% ${x.reason}`).sort();
  assert.deepEqual(
    got,
    [
      "キウイフルーツ 65.7% 野菜ではない",
      "グレープフルーツ 11.0% 野菜ではない",
      "ジョナゴールド 21.8% 野菜ではない",
      "すいか 16.7% 野菜ではない",
      "たけのこ 160.1% 入荷量100トン未満",
      "はくさい 13.9% 件数の上限(3件)",
      "ふじ 11.0% 野菜ではない",
      "りんご計 11.2% 野菜ではない",
      "さやえんどう -18.5% 入荷量100トン未満",
      "しゅんぎく -12.6% 入荷量100トン未満",
      "スイートコーン 11.0% 件数の上限(3件)",
      "その他の野菜 11.1% 集計の行",
      "他の輸入野菜 11.8% 集計の行",
      "幸水 93.3% 野菜ではない",
      "渋がき -13.5% 野菜ではない",
      "輸入野菜計 10.8% 集計の行",
      "かき計 -12.0% 野菜ではない",
    ].sort(),
  );
});

test("S-4 Xの下書きの全文(↑↓、農林水産省、Xの上限280以内)", () => {
  const draft = buildXDraft(sel, fx.current.period, fx.previous.period);
  assert.equal(
    draft,
    [
      "【野菜の卸売価格 10月上旬】",
      "前の旬(9月下旬)と比べて",
      "↑キャベツ +43%",
      "↑ピーマン +14%",
      "↑きゅうり +14%",
      "↓こまつな −17%",
      "↓みずな −12%",
      "キャベツは前年同時期の約1.7倍。キャベツを多く使うメニューは、仕入れ値の確認を。",
      "出典:農林水産省「青果物卸売市場調査」をもとに加工(国の保証なし)",
    ].join("\n"),
  );
  assert.ok(xWeightedLength(draft) <= X_LIMIT, `Xの数え方で${xWeightedLength(draft)}`);
  assert.ok(!/[▲▼]/.test(draft));
});

test("S-5 前年同旬比の表示: 95〜105は「前年並み」", () => {
  assert.deepEqual(
    [95, 100, 105, 94, 106, 171, 177, null].map(formatYoy),
    ["前年並み", "前年並み", "前年並み", "約0.9倍", "約1.1倍", "約1.7倍", "約1.8倍", null],
  );
});

test("S-6 変動率の表示(四捨五入は絶対値で)", () => {
  assert.deepEqual([42.6, 14.4, 14.0, -11.6, -17.0, 10.5, -10.5].map(formatChange), ["+43%", "+14%", "+14%", "−12%", "−17%", "+11%", "−11%"]);
});

// ── 並び順の決まり(作った値) ──
const r = (code: string, name: string, prev: number, cur: number, ton: number): [ShunpoRow, ShunpoRow] => [
  { item_code: code, item_name: name, price_per_kg: cur, wholesale_quantity_ton: ton, yoy_price_percent: 100 },
  { item_code: code, item_name: name, price_per_kg: prev, wholesale_quantity_ton: ton, yoy_price_percent: 100 },
];
function pick(pairs: [ShunpoRow, ShunpoRow][]) {
  const s = selectShunpoItems(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  return { up: s.up.map((x) => x.itemName), down: s.down.map((x) => x.itemName), limit: s.excluded.filter((x) => x.reason === "件数の上限(3件)").map((x) => x.itemName) };
}

test("T-1 変動率がまったく同じなら、入荷量の多い順", () => {
  assert.deepEqual(pick([r("31001", "A", 100, 120, 200), r("31002", "B", 100, 120, 900), r("31003", "C", 100, 120, 500)]).up, ["B", "C", "A"]);
});

test("T-2 変動率も入荷量も同じなら、品目コード順", () => {
  assert.deepEqual(pick([r("31009", "Z", 100, 120, 300), r("31001", "Y", 100, 120, 300)]).up, ["Y", "Z"]);
});

test("T-3 四捨五入すると同じでも、四捨五入前の変動率の大きい順(入荷量より優先)", () => {
  // 14.4% と 14.0%(どちらも表示は14%)。入荷量は14.0%の方が多いが、14.4%が先
  assert.deepEqual(pick([r("31001", "多い", 1000, 1140, 5000), r("31002", "少ない", 1000, 1144, 200)]).up, ["少ない", "多い"]);
});

test("T-4 4件目以降は「件数の上限」で外れる。値下がりも同じ並び順", () => {
  const got = pick([r("31001", "a", 100, 85, 300), r("31002", "b", 100, 80, 300), r("31003", "c", 100, 85, 900), r("31004", "d", 100, 89, 300), r("31005", "e", 100, 90, 300)]);
  assert.deepEqual(got.down, ["b", "c", "a"]);
  assert.deepEqual(got.limit, ["d", "e"]);
});

test("T-5 10%ちょうどは入る、9.9%は入らない。100トンちょうどは入る、99トンは入らない", () => {
  const got = pick([r("31001", "10%", 1000, 1100, 300), r("31002", "9.9%", 1000, 1099, 300), r("31003", "100t", 100, 150, 100), r("31004", "99t", 100, 150, 99)]);
  assert.deepEqual(got.up, ["100t", "10%"]);
});

test("T-6 該当がないときの下書き", () => {
  const s = selectShunpoItems([], []);
  assert.equal(
    buildXDraft(s, { year: 2026, month: 10, third: 2 }, { year: 2026, month: 10, third: 1 }),
    "【野菜の卸売価格 10月中旬】\n前の旬(10月上旬)と比べて\n前の旬から10%以上動いた品目はありませんでした。\n出典:農林水産省「青果物卸売市場調査」をもとに加工(国の保証なし)",
  );
});

// ── 最後の一言の選び方(2026-10-26。U-1〜U-8はMahiroが確認する) ──
// 決まり: ①値上がりの品目で前年同旬比130以上 → その中で最大 ②①が無く、値下がりの品目で130以上 → その中で最大
//         ③値上がりの品目がある → いちばん大きく上がった品目 ④値下がりだけ ⑤どちらも無い。同じ前年同旬比なら選ばれた順で先
const it = (name: string, changePercent: number, yoyIndex: number | null): ShunpoItem => ({
  itemCode: "3", itemName: name, previousPrice: 100, currentPrice: 100, changePercent, quantityTon: 500, yoyIndex,
});
const tip = (up: ShunpoItem[], down: ShunpoItem[]) => tipLine({ up, down, excluded: [] });

test("U-1 値上がりに130以上が複数 → 前年同旬比の最も大きい品目(変動率の順位ではない)", () => {
  assert.equal(tip([it("キャベツ", 40, 140), it("はくさい", 20, 160)], []), "はくさいは前年同時期の約1.6倍。はくさいを多く使うメニューは、仕入れ値の確認を。");
});

test("U-2 値上がりにも値下がりにも130以上 → 値上がりの品目を優先(値下がりの方が前年同旬比が大きくても)", () => {
  assert.equal(tip([it("キャベツ", 40, 131)], [it("こまつな", -17, 177)]), "キャベツは前年同時期の約1.3倍。キャベツを多く使うメニューは、仕入れ値の確認を。");
});

test("U-3 値上がりの品目はあるが130未満、値下がりだけが130以上 → 値下がりの品目で、前年よりまだ高いことを伝える", () => {
  assert.equal(tip([it("ピーマン", 14, 101)], [it("みずな", -12, 218), it("こまつな", -17, 177)]), "みずなは値下がりしましたが、前年同時期の約2.2倍です。");
});

test("U-4 値上がりの品目が無く、値下がりだけが130以上 → 同じく値下がりの品目", () => {
  assert.equal(tip([], [it("こまつな", -17, 177)]), "こまつなは値下がりしましたが、前年同時期の約1.8倍です。");
});

test("U-5 130以上が無く、値上がりの品目がある → いちばん大きく上がった品目", () => {
  assert.equal(tip([it("きゅうり", 25, 119), it("ピーマン", 14, 101)], [it("みずな", -12, 90)]), "きゅうりを多く使うメニューは、仕入れ値の確認を。");
});

test("U-6 130以上が無く、値下がりだけ", () => {
  assert.equal(tip([], [it("みずな", -12, 90)]), "値下がりした品目は、仕入れ値の見直しの参考に。");
});

test("U-7 前年同旬比が同じなら、選ばれた順(変動率の大きい順)で先の品目。130ちょうどは対象、129は対象外", () => {
  assert.equal(tip([it("A", 30, 150), it("B", 20, 150)], []), "Aは前年同時期の約1.5倍。Aを多く使うメニューは、仕入れ値の確認を。");
  assert.equal(tip([it("C", 30, 129), it("D", 20, 130)], []), "Dは前年同時期の約1.3倍。Dを多く使うメニューは、仕入れ値の確認を。");
});

test("U-8 前年同旬比が無い(CSVで欠測)品目は、取り上げない", () => {
  assert.equal(tip([it("新顔", 50, null)], []), "新顔を多く使うメニューは、仕入れ値の確認を。");
});
