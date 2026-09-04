import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseChikusanPdf } from "./parseChikusanPdf.ts";
import { selectMonthlyComparisonPair, toMarketItems } from "./monthlyComparison.ts";
import { confirmedLinksToMatches } from "./confirmedLinksToMatches.ts";
import { detectPriceChanges } from "../detectPriceChanges.ts";
import { generateMarketPriceAlerts } from "../generateAlerts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = readFileSync(join(__dirname, "fixtures", "index-594.pdf"));

test("実データ一式(PDF取得→解析→確定リンク→変動検知→通知生成)が既存のgenerateAlertsにそのまま乗る", async () => {
  const parsed = await parseChikusanPdf(fixtureBytes);
  assert.equal(parsed.status, "ok");
  if (parsed.status !== "ok") return;

  const pair = selectMonthlyComparisonPair(parsed.rows)!;
  const currentItems = toMarketItems(pair.current.row);
  const previousItems = toMarketItems(pair.previous.row);

  // 実データ: 豚肉(極上・上, 東京)は 8年7月=731円/kg -> 8年8月=665円/kg (約-9%)
  const priceChanges = detectPriceChanges(currentItems, previousItems, 5);

  // 店主が「豚肉」という食材を pork_tokyo に明示的に確定させている想定
  const matches = confirmedLinksToMatches([
    { ingredientId: "ing-pork", ingredientName: "豚肉", itemCode: "pork_tokyo" },
  ]);

  const { alerts } = generateMarketPriceAlerts({
    priceChanges,
    matches,
    ingredients: [{ id: "ing-pork", name: "豚肉", currentPurchasePrice: 0.7 }],
    menus: [{ id: "menu-donkatsu", name: "とんかつ定食", sellingPrice: 1200, targetCostRate: 25 }],
    menuIngredients: [{ menuId: "menu-donkatsu", ingredientId: "ing-pork", quantity: 200 }],
    defaultTargetCostRate: 30,
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].ingredientName, "豚肉");
  assert.equal(alerts[0].direction, "down");
  assert.equal(alerts[0].affectedMenus[0].menuName, "とんかつ定食");
});

test("未確定(リンクなし)の食材は通知対象にならない", async () => {
  const parsed = await parseChikusanPdf(fixtureBytes);
  assert.equal(parsed.status, "ok");
  if (parsed.status !== "ok") return;
  const pair = selectMonthlyComparisonPair(parsed.rows)!;
  const priceChanges = detectPriceChanges(toMarketItems(pair.current.row), toMarketItems(pair.previous.row), 5);

  const { alerts } = generateMarketPriceAlerts({
    priceChanges,
    matches: confirmedLinksToMatches([]), // 何も確定していない
    ingredients: [{ id: "ing-pork", name: "豚肉", currentPurchasePrice: 0.7 }],
    menus: [],
    menuIngredients: [],
    defaultTargetCostRate: 30,
  });
  assert.equal(alerts.length, 0);
});
