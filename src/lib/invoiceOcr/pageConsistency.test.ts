import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesMismatchNotice, MULTI_PAGE_HINT } from "./pageConsistency.ts";

// 複数の写真(・PDFの複数ページ)が、別々の納品書だったときに気づく(2026-10-28)。期待値G-1〜G-6はMahiroが確認する。
// AIにページごとの日付・仕入れ先を返してもらい、違うページがあれば確認の画面で知らせる(止めはしない)。

test("G-1 写真を選ぶ欄に、選ぶ前から出す案内", () => {
  assert.equal(MULTI_PAGE_HINT, "複数選ぶときは、同じ納品書の続きのページだけにしてください");
});

test("G-2 1ページだけ、またはすべてのページの日付・仕入れ先が同じ → 知らせない", () => {
  assert.equal(pagesMismatchNotice([{ page: 1, date: "2026-10-20", supplier: "山田青果" }]), null);
  assert.equal(
    pagesMismatchNotice([
      { page: 1, date: "2026-10-20", supplier: "(株)山田青果" },
      { page: 2, date: "2026-10-20", supplier: "山田青果 株式会社" }, // 書き方のゆれは同じとみなす
    ]),
    null,
  );
});

test("G-3 日付が違うページがある → 知らせる(ページごとの日付・仕入れ先を見せる)", () => {
  assert.equal(
    pagesMismatchNotice([
      { page: 1, date: "2026-10-20", supplier: "山田青果" },
      { page: 2, date: "2026-10-21", supplier: "山田青果" },
    ]),
    "選んだページの中に、日付か仕入れ先が違うページがあります(1枚目: 10月20日・山田青果、2枚目: 10月21日・山田青果)。別々の納品書なら、1枚ずつ読み取ってください",
  );
});

test("G-4 仕入れ先が違うページがある → 知らせる", () => {
  const n = pagesMismatchNotice([
    { page: 1, date: "2026-10-20", supplier: "山田青果" },
    { page: 2, date: "2026-10-20", supplier: "佐藤精肉店" },
  ]);
  assert.match(n!, /1枚目: 10月20日・山田青果、2枚目: 10月20日・佐藤精肉店/);
});

test("G-5 続きのページに日付・仕入れ先が書かれていない(読み取れない)のは、違うとみなさない", () => {
  assert.equal(
    pagesMismatchNotice([
      { page: 1, date: "2026-10-20", supplier: "山田青果" },
      { page: 2, date: null, supplier: null },
      { page: 3, date: "2026-10-20", supplier: null },
    ]),
    null,
  );
});

test("G-6 読み取れなかった項目は「不明」と見せる", () => {
  assert.match(
    pagesMismatchNotice([
      { page: 1, date: "2026-10-20", supplier: "山田青果" },
      { page: 2, date: "2026-10-22", supplier: null },
    ])!,
    /2枚目: 10月22日・不明/,
  );
});
