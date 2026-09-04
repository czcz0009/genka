/**
 * 2つの旬(通常は今回と前回、=前後10日前後)の卸売価格を品目コードで突き合わせ、
 * 変動率が閾値を超えた品目を検出する。
 */
import type { SyuyoItem } from "./parseSyuyoCsv.ts";

export interface PriceChangeEvent {
  itemCode: string;
  itemName: string;
  oldPricePerKg: number;
  newPricePerKg: number;
  /** 符号付き変動率(%)。値上がりなら正、値下がりなら負。 */
  changePercent: number;
  direction: "up" | "down";
}

/** デフォルトの検知閾値(%)。ユーザーが設定で変更できる想定の初期値。 */
export const DEFAULT_CHANGE_THRESHOLD_PERCENT = 10;

/**
 * @param currentItems 今回取得分の品目一覧
 * @param previousItems 前回取得分(前の旬)の品目一覧
 * @param thresholdPercent 検知する変動率のしきい値(絶対値、%)
 */
export function detectPriceChanges(
  currentItems: SyuyoItem[],
  previousItems: SyuyoItem[],
  thresholdPercent: number = DEFAULT_CHANGE_THRESHOLD_PERCENT,
): PriceChangeEvent[] {
  const previousByCode = new Map(previousItems.map((i) => [i.itemCode, i]));
  const events: PriceChangeEvent[] = [];

  for (const current of currentItems) {
    if (current.isBreakdownRow) continue;
    if (current.pricePerKg == null) continue;

    const previous = previousByCode.get(current.itemCode);
    if (!previous || previous.pricePerKg == null || previous.pricePerKg === 0) continue;

    const changePercent = ((current.pricePerKg - previous.pricePerKg) / previous.pricePerKg) * 100;
    if (Math.abs(changePercent) < thresholdPercent) continue;

    events.push({
      itemCode: current.itemCode,
      itemName: current.itemName,
      oldPricePerKg: previous.pricePerKg,
      newPricePerKg: current.pricePerKg,
      changePercent,
      direction: changePercent > 0 ? "up" : "down",
    });
  }

  return events;
}
