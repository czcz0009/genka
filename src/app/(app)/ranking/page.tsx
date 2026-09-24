import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData, getIngredientPreviousPrices, getIngredientPriceHistory } from "@/lib/store";
import {
  buildMenuRanking,
  findPriceHeadroomMenus,
  type RankingMenu,
  type RankingMenuIngredient,
  type RankingSales,
} from "@/lib/menuRanking";
import { resolveHistoricalPrice } from "@/lib/ingredientPriceHistory";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
import { monthToPeriod, currentMonthString } from "@/lib/period/month";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { RankingView } from "./RankingView.tsx";

export const metadata: Metadata = {
  title: "今見直すべきメニュー",
};

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー診断" title="今見直すべきメニュー" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const session = await getSessionStore(supabase);
  if (session.status === "unauthenticated") redirect("/login");
  if (session.status === "error") {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const { store } = session;

  const { month: monthParam } = await searchParams;

  // menus・ingredients・menu_ingredients・menu_sales(全期間)を1回のRPC
  // (get_store_data)でまとめて取得する(以前は最大5回のクエリに分かれていた)。
  // 「対象月の絞り込み」「利用可能な月の一覧」はどちらもこの1回の取得結果から
  // JS側で計算するため、月ごとの追加クエリは発生しない。
  // 食材の「1つ前の仕入単価」(月間の利益への影響額の計算用)・仕入単価の変更履歴
  // (過去の月を見たときに当時の単価を再現するため)はこの画面でしか使わないため、
  // get_store_dataとは別のRPCで並行して取得する。
  const [storeData, previousPrices, priceHistory] = await Promise.all([
    getStoreData(supabase),
    getIngredientPreviousPrices(supabase),
    getIngredientPriceHistory(supabase),
  ]);
  const menus = storeData?.menus ?? [];

  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー診断" title="今見直すべきメニュー" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューを登録すると、見直しの優先度が高いメニューからここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

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
  // previousPurchasePrice(月間の利益への影響額の計算用)は「直近の価格変更」という
  // 別の意味の値のため、ここでは変更しない。
  //
  // 仕込み品は仕入単価の履歴を持たない(値を保存せずその場で計算する方式のため)。
  // そのため、まず通常の食材だけ履歴価格に差し替えたうえで、仕込み品の実質単価を
  // その履歴価格から計算する(withResolvedPrepItemPrices)。previousPurchasePriceも
  // 仕込み品には無い(=変動なしとして扱われ、月間影響額の計算には寄与しない。
  // 仕込み品の価格変動検知は今回のスコープ外)。
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
  const headroomMenus = findPriceHeadroomMenus(summaries);

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="メニュー診断"
        title="今見直すべきメニュー"
        description="対応の優先度が高い順に並んでいます。原価率が目標を超えているメニューを優先して表示し、その中では値上げした場合の月間効果が大きいものから順に並べます。目標内のメニューは、利益貢献度(販売数量×(売価-原価))が高い順です。"
      />
      <RankingView
        storeId={store.id}
        month={month}
        availableMonths={availableMonths}
        summaries={summaries}
        menus={rankingMenus}
        headroomMenus={headroomMenus}
      />
    </div>
  );
}
