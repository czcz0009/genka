import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runMarketPriceCollectionCycle } from "./runCollectionCycle.ts";
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "26073h_syuyo.csv"));

function item(partial: Partial<SyuyoItem> & { itemCode: string; itemName: string }): SyuyoItem {
  return {
    isBreakdownRow: false,
    wholesaleQuantityTon: null,
    wholesaleValueThousandYen: null,
    pricePerKg: null,
    yoyQuantityPercent: null,
    yoyPricePercent: null,
    prevThirdQuantityPercent: null,
    prevThirdPricePercent: null,
    ...partial,
  };
}

test("未公表(not_published)の旬は、エラーにせずそのステータスを返す", async () => {
  const result = await runMarketPriceCollectionCycle({
    period: { year: 2026, month: 8, third: 3 },
    previousItems: [],
    ingredients: [],
    menus: [],
    menuIngredients: [],
    defaultTargetCostRate: 30,
    fetchFn: async () => ({ status: "not_published", httpStatus: 403 }),
  });
  assert.equal(result.status, "not_published");
});

test("ネットワークエラー等は error ステータスとして返す(例外を投げない)", async () => {
  const result = await runMarketPriceCollectionCycle({
    period: { year: 2026, month: 8, third: 3 },
    previousItems: [],
    ingredients: [],
    menus: [],
    menuIngredients: [],
    defaultTargetCostRate: 30,
    fetchFn: async () => ({ status: "error", detail: "network down" }),
  });
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.detail, "network down");
});

test("実データ一式(取得→解析→前回比較→マッチング→通知生成)が一気通貫で動く", async () => {
  // 前回(6月下旬)のたまねぎ価格を実データより大幅に低く設定し、値上がりを検知させる
  const previousItems = [item({ itemCode: "36610", itemName: "たまねぎ", pricePerKg: 100 })];

  const result = await runMarketPriceCollectionCycle({
    period: { year: 2026, month: 7, third: 3 },
    previousItems,
    ingredients: [{ id: "ing-onion", name: "玉ねぎ", currentPurchasePrice: 0.15 }],
    menus: [{ id: "menu-a", name: "カレーライス", sellingPrice: 800, targetCostRate: 10 }],
    menuIngredients: [{ menuId: "menu-a", ingredientId: "ing-onion", quantity: 300 }],
    defaultTargetCostRate: 30,
    fetchFn: async () => ({ status: "ok", bytes: fixtureBytes.buffer.slice(
      fixtureBytes.byteOffset,
      fixtureBytes.byteOffset + fixtureBytes.byteLength,
    ) }),
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.parsedPeriod, { year: 2026, month: 7, third: 3 });
  // 実データのたまねぎ価格(155円/kg)は前回設定(100円/kg)より+10%以上値上がりしている
  const onionAlert = result.alerts.find((a) => a.ingredientName === "玉ねぎ");
  assert.ok(onionAlert, "onion alert should be generated");
  assert.equal(onionAlert!.direction, "up");
  assert.equal(onionAlert!.affectedMenus.length, 1);
  assert.equal(onionAlert!.affectedMenus[0].menuName, "カレーライス");
});
