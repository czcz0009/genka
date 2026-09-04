/**
 * 1回分の収集サイクル(取得→解析→前回分との比較→食材マッチング→通知内容生成)を
 * まとめて実行する。月3回(上旬・中旬・下旬)、スケジューラ(将来的にはVercel Cron等)
 * から1旬につき1回だけ呼び出される想定。
 *
 * 価格観測データの永続化(前回分の取得・今回分の保存)はDB層の責務として切り出し、
 * ここでは呼び出し側から「前回分」を受け取り、「今回分」を返すだけにしている
 * (①のSupabase未接続時と同じ方針: ロジックはDBに依存させず、配線は後で行う)。
 */
import type { Period } from "./period.ts";
import { fetchSyuyoCsv, type FetchSyuyoResult } from "./fetchSyuyoCsv.ts";
import { parseSyuyoCsv, type SyuyoItem } from "./parseSyuyoCsv.ts";
import { detectPriceChanges, DEFAULT_CHANGE_THRESHOLD_PERCENT } from "./detectPriceChanges.ts";
import { matchIngredientsToItems, type IngredientRef } from "./matchIngredientToItem.ts";
import {
  generateMarketPriceAlerts,
  type AlertIngredient,
  type AlertMenu,
  type AlertMenuIngredient,
  type MarketPriceAlert,
  type GenerateAlertsResult,
} from "./generateAlerts.ts";

export interface RunCollectionCycleInput {
  period: Period;
  /** 前回(1つ前の旬)に保存済みの品目一覧。まだ何も保存されていなければ空配列。 */
  previousItems: SyuyoItem[];
  ingredients: AlertIngredient[];
  menus: AlertMenu[];
  menuIngredients: AlertMenuIngredient[];
  defaultTargetCostRate: number;
  thresholdPercent?: number;
  /** テスト用の差し替え。省略時は実際にネットワーク取得する fetchSyuyoCsv を使う。 */
  fetchFn?: (period: Period) => Promise<FetchSyuyoResult>;
}

export type RunCollectionCycleResult =
  | { status: "not_published"; period: Period; httpStatus: number }
  | { status: "error"; period: Period; detail: string }
  | ({
      status: "ok";
      period: Period;
      /** CSVのタイトル行から読み取れた期間(requestしたperiodと一致するはずの確認用) */
      parsedPeriod: Period | null;
      currentItems: SyuyoItem[];
    } & GenerateAlertsResult);

export async function runMarketPriceCollectionCycle(
  input: RunCollectionCycleInput,
): Promise<RunCollectionCycleResult> {
  const fetchFn = input.fetchFn ?? fetchSyuyoCsv;
  const fetchResult = await fetchFn(input.period);

  if (fetchResult.status === "not_published") {
    return { status: "not_published", period: input.period, httpStatus: fetchResult.httpStatus };
  }
  if (fetchResult.status === "error") {
    return { status: "error", period: input.period, detail: fetchResult.detail };
  }

  const parsed = parseSyuyoCsv(fetchResult.bytes);
  const priceChanges = detectPriceChanges(
    parsed.items,
    input.previousItems,
    input.thresholdPercent ?? DEFAULT_CHANGE_THRESHOLD_PERCENT,
  );
  const ingredientRefs: IngredientRef[] = input.ingredients.map((i) => ({ id: i.id, name: i.name }));
  const matches = matchIngredientsToItems(ingredientRefs, parsed.items);
  const alertResult = generateMarketPriceAlerts({
    priceChanges,
    matches,
    ingredients: input.ingredients,
    menus: input.menus,
    menuIngredients: input.menuIngredients,
    defaultTargetCostRate: input.defaultTargetCostRate,
  });

  return {
    status: "ok",
    period: input.period,
    parsedPeriod: parsed.period,
    currentItems: parsed.items,
    ...alertResult,
  };
}

export type { MarketPriceAlert };
