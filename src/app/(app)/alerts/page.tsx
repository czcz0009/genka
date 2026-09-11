import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { computeStoreAlerts } from "@/lib/marketPrices/computeStoreAlerts";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { AlertsView } from "./AlertsView.tsx";
import { LivestockLinkSettings } from "./LivestockLinkSettings.tsx";

export const metadata: Metadata = {
  title: "仕入れ値変動アラート",
};

export default async function AlertsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="仕入れ値アラート" title="仕入れ値変動アラート" />
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

  // ingredients・menus・menu_ingredientsを1回のRPC(get_store_data)でまとめて
  // 取得する(以前は3クエリの並列取得だったが、往復そのものを1回に減らす)。
  // 市場データ(旬別・月別の全履歴)側の取得はcomputeStoreAlerts内で行うため、
  // メニューが1件も無ければその呼び出し自体をスキップして案内だけ出す。
  const storeData = await getStoreData(supabase);
  const menus = storeData?.menus ?? [];

  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="仕入れ値アラート" title="仕入れ値変動アラート" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューと食材を登録すると、市場価格の変動アラートがここに表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  const alertIngredients = (storeData?.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.currentPurchasePrice,
  }));
  const alertMenus = menus.map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.sellingPrice,
    targetCostRate: m.targetCostRate,
  }));
  const alertMenuIngredients = (storeData?.menuIngredients ?? []).map((mi) => ({
    menuId: mi.menuId,
    ingredientId: mi.ingredientId,
    quantity: mi.quantity,
  }));

  const {
    produceAlerts,
    produceNeedsReview,
    livestockAlerts,
    hasProduceComparison,
    hasLivestockComparison,
    unlinkedIngredients,
    linkedIngredients,
  } = await computeStoreAlerts(supabase, store, alertIngredients, alertMenus, alertMenuIngredients);

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="仕入れ値アラート"
        title="仕入れ値変動アラート"
        description="農水省「青果物卸売市場調査(旬別結果)」「畜産物卸売価格の推移」の市場価格をもとに、市場価格の変動率がそのまま仕入単価に反映されたと仮定した場合の試算原価率を表示します。実際に仕入単価を変更した結果ではありません。"
      />

      <AlertsView
        produceAlerts={produceAlerts}
        produceNeedsReview={produceNeedsReview}
        livestockAlerts={livestockAlerts}
        hasProduceComparison={hasProduceComparison}
        hasLivestockComparison={hasLivestockComparison}
      />

      <LivestockLinkSettings unlinkedIngredients={unlinkedIngredients} linkedIngredients={linkedIngredients} />
    </div>
  );
}
