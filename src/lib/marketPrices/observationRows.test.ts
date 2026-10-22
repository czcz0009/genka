import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLivestockObservationRows, buildProduceObservationRows } from "./observationRows.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";
import type { ChikusanRow } from "./livestock/parseChikusanPdf.ts";

// 市場価格をDBに書き込む行の組み立て(2026-10-22)。
// 以前は取得日(fetched_at)を渡しておらず、上書き(upsert)しても取得日が最初に入れた日のままだった
// (2026年8月の鶏肉の値は直ったのに、取得日は2026-09-04のままだった)。
// 今は、書き込むたびに「最後に農水省から取得して保存した日時」を取得日に入れる。

const item = (partial: Partial<SyuyoItem>): SyuyoItem => ({
  itemCode: "31700",
  itemName: "キャベツ",
  isBreakdownRow: false,
  wholesaleQuantityTon: 1000,
  wholesaleValueThousandYen: 174000,
  pricePerKg: 174,
  yoyQuantityPercent: 98,
  yoyPricePercent: 120,
  prevThirdQuantityPercent: 101,
  prevThirdPricePercent: 143,
  ...partial,
});

test("野菜: すべての行に、渡した取得日が入る", () => {
  const rows = buildProduceObservationRows({ year: 2026, month: 10, third: 1 }, [item({}), item({ itemCode: "31500", itemName: "こまつな" })], "2026-10-22T02:00:00.000Z");
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.fetched_at, "2026-10-22T02:00:00.000Z");
});

test("野菜: 内訳行(「うち◯◯」)は書き込まない。値と期間はそのまま入る(定期取得と同じ行の形)", () => {
  const rows = buildProduceObservationRows(
    { year: 2026, month: 10, third: 1 },
    [item({}), item({ itemCode: "31799", itemName: "うち春キャベツ", isBreakdownRow: true })],
    "2026-10-22T02:00:00.000Z",
  );
  assert.deepEqual(rows, [
    {
      item_code: "31700",
      item_name: "キャベツ",
      period_year: 2026,
      period_month: 10,
      period_third: 1,
      wholesale_quantity_ton: 1000,
      wholesale_value_thousand_yen: 174000,
      price_per_kg: 174,
      yoy_quantity_percent: 98,
      yoy_price_percent: 120,
      prev_third_quantity_percent: 101,
      prev_third_price_percent: 143,
      fetched_at: "2026-10-22T02:00:00.000Z",
    },
  ]);
});

test("食肉: 月別の行だけを、価格の列ごとの行にする。すべての行に、渡した取得日が入る", () => {
  const pdfRows: ChikusanRow[] = [
    { kind: "monthly", rowLabel: "8年 8月", weekday: null, prices: { chicken_thigh: 832, chicken_breast: 474 } },
    { kind: "third", rowLabel: "上旬", weekday: null, prices: { chicken_thigh: 830 } },
    { kind: "daily", rowLabel: "1日", weekday: "月", prices: { chicken_thigh: 829 } },
  ];
  const rows = buildLivestockObservationRows(pdfRows, "2026-10-22T02:00:00.000Z");
  const thigh = rows.find((r) => r.item_code === "chicken_thigh")!;
  const breast = rows.find((r) => r.item_code === "chicken_breast")!;
  assert.deepEqual(
    { year: thigh.period_year, month: thigh.period_month, price: thigh.price_per_kg, fetched_at: thigh.fetched_at },
    { year: 2026, month: 8, price: 832, fetched_at: "2026-10-22T02:00:00.000Z" },
  );
  assert.equal(breast.price_per_kg, 474);
  // 価格の列(itemCodeがある列)の数だけ行ができる。頭数などの列は含まない
  assert.ok(rows.every((r) => r.period_year === 2026 && r.period_month === 8));
  assert.ok(rows.every((r) => r.fetched_at === "2026-10-22T02:00:00.000Z"));
  assert.ok(!rows.some((r) => r.item_code == null));
});

test("上書き: 同じ期間・品目を、後の取得日で組み立て直すと、取得日が新しくなる(値が同じでも)", () => {
  const first = buildProduceObservationRows({ year: 2026, month: 8, third: 3 }, [item({})], "2026-09-04T07:51:43.000Z");
  const again = buildProduceObservationRows({ year: 2026, month: 8, third: 3 }, [item({})], "2026-10-22T02:00:00.000Z");
  assert.equal(first[0].fetched_at, "2026-09-04T07:51:43.000Z");
  assert.equal(again[0].fetched_at, "2026-10-22T02:00:00.000Z");
  assert.equal(again[0].price_per_kg, first[0].price_per_kg);
});
