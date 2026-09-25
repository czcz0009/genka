import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuCostSummary } from "./types.ts";
import { getStoreData, getIngredientPreviousPrices, getIngredientPriceHistory } from "./store.ts";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient, type RankingSales } from "./menuRanking.ts";
import { resolveHistoricalPrice } from "./ingredientPriceHistory.ts";
import { withResolvedPrepItemPrices } from "./prepItemCost.ts";
import { monthToPeriod, currentMonthString } from "./period/month.ts";

export interface MonthlyMenuSummaries {
  month: string;
  availableMonths: string[];
  summaries: MenuCostSummary[];
  menus: RankingMenu[];
}

/**
 * 指定した月の、メニューごとの原価・原価率・利益貢献度のまとめ。
 *
 * 「今見直すべきメニュー」画面と「売上管理」画面はどちらも同じ「その月の
 * 原価率・利益」を土台にしているため(前者は対応優先度で並べ替え、後者は
 * 売上高で並べ替えるだけの違い)、月の解決・過去の仕入単価の再現・仕込み品の
 * 解決・buildMenuRankingの呼び出しをここに1つにまとめている。
 *
 * メニューが1件も無い店舗ではnullを返す(呼び出し側で「まずはここから」の
 * 案内を出す)。
 */
export async function computeMonthlyMenuSummaries(
  supabase: SupabaseClient,
  store: { id: string; defaultTargetCostRate: number },
  monthParam?: string | null,
): Promise<MonthlyMenuSummaries | null> {
  const [storeData, previousPrices, priceHistory] = await Promise.all([
    getStoreData(supabase),
    getIngredientPreviousPrices(supabase),
    getIngredientPriceHistory(supabase),
  ]);
  const menus = storeData?.menus ?? [];
  if (menus.length === 0) return null;

  const allSales = storeData?.sales ?? [];
  const availableMonths = Array.from(new Set(allSales.map((s) => s.periodStart.slice(0, 7)))).sort();
  const month = monthParam ?? availableMonths[availableMonths.length - 1] ?? currentMonthString();
  const period = monthToPeriod(month);

  const rankingMenus: RankingMenu[] = menus.map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.sellingPrice,
    targetCostRate: m.targetCostRate,
  }));
  const rankingMenuIngredients: RankingMenuIngredient[] = (storeData?.menuIngredients ?? []).map((mi) => ({
    menuId: mi.menuId,
    ingredientId: mi.ingredientId,
    quantity: mi.quantity,
  }));
  const rankingSales: RankingSales[] = allSales
    .filter((s) => s.periodStart === period.start && s.periodEnd === period.end)
    .map((s) => ({ menuId: s.menuId, quantitySold: s.quantitySold }));

  // その月の末日時点で実際に使われていた仕入単価を再現する(値上がり後にこの画面で
  // 過去の月を見ても、今の単価で遡及的に再計算されないようにするため)。
  // 仕込み品は仕入単価の履歴を持たないため、通常の食材だけ履歴価格に差し替えたうえで
  // 仕込み品の実質単価をその履歴価格から計算する(withResolvedPrepItemPrices)。
  const historicizedIngredients = (storeData?.ingredients ?? []).map((i) => ({
    ...i,
    currentPurchasePrice: i.isPrepItem ? 0 : resolveHistoricalPrice(priceHistory, i.id, period.end, i.currentPurchasePrice),
  }));
  const resolvedIngredients = withResolvedPrepItemPrices(historicizedIngredients, storeData?.prepItemComponents ?? []);
  const rankingIngredients = resolvedIngredients.map((i) => ({
    id: i.id,
    currentPurchasePrice: i.currentPurchasePrice,
    previousPurchasePrice: previousPrices.get(i.id) ?? null,
    yieldRatePercent: i.yieldRatePercent,
  }));

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: rankingSales,
    defaultTargetCostRate: store.defaultTargetCostRate,
  });

  return { month, availableMonths, summaries, menus: rankingMenus };
}
