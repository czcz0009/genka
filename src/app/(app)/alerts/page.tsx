import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { computeStoreAlerts } from "@/lib/marketPrices/computeStoreAlerts";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { HelpButton } from "@/components/HelpButton.tsx";
import { AlertsView } from "./AlertsView.tsx";
import { LivestockLinkSettings } from "./LivestockLinkSettings.tsx";
import { IngredientOverview } from "./IngredientOverview.tsx";

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
        <PageHeader eyebrow="仕入れ値アラート" title="仕入れ値変動アラート" actions={<AlertsHelpButton />} />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          メニューと食材を登録すると、市場価格の変動アラートがここに表示されます。電話・FAXでの仕入れなど、どんな仕入れ方法のお店でも、特別なシステム連携なしで使えます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  // 仕込み品(サブレシピ)は仕入単価を持たないため、レシピから計算した実質単価に
  // 差し替える(市場価格アラート自体は末端の食材にのみ紐づくが、試算原価率の
  // ベースとなる原価にはメニューが使う仕込み品の分も正しく含める必要がある)。
  const alertIngredients = withResolvedPrepItemPrices(
    storeData?.ingredients ?? [],
    storeData?.prepItemComponents ?? [],
  ).map((i) => ({
    id: i.id,
    name: i.name,
    currentPurchasePrice: i.currentPurchasePrice,
    yieldRatePercent: i.yieldRatePercent,
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
    livestockAlerts,
    hasProduceComparison,
    hasLivestockComparison,
    unlinkedIngredients,
    linkedIngredients,
    ingredientOverview,
  } = await computeStoreAlerts(supabase, store, alertIngredients, alertMenus, alertMenuIngredients);

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="仕入れ値アラート"
        title="仕入れ値変動アラート"
        actions={<AlertsHelpButton />}
        description={
          <>
            農水省「青果物卸売市場調査(旬別結果)」「畜産物卸売価格の推移」の市場価格をもとに、市場価格の変動率がそのまま仕入単価に反映されたと仮定した場合の試算原価率を表示します。実際に仕入単価を変更した結果ではありません。電話・FAXでの仕入れなど、どんな仕入れ方法のお店でも使えます。特別なシステム連携は不要です。
            <br />
            {/*
              配布前QAで確認した内容の明記: 畜産物(豚・牛・鶏)は東京市場限定のデータ、
              青果物は全国の主要卸売市場をまとめた値であり、どちらも「その店の実際の
              仕入れ値」そのものではない。この位置づけの違いを店主に誤解させないよう
              平易な言葉で明記する。
            */}
            <span className="text-xs opacity-80">
              畜産物(豚・牛・鶏)は東京市場、青果物は全国の主要な卸売市場をまとめた価格を、値動きの目安として使っています。地域やお店の仕入れルートによっては、実際の仕入れ値との差が大きくなる場合があります。
            </span>
          </>
        }
      />

      {/*
        まずこの一覧で「登録している食材が追跡対象になっているか・今の相場はどうか」を
        全体把握できるようにし、その中で大きく変動したものを色で強調する。
        変動の詳細(影響メニュー・原価率試算)は下の「価格変動アラート」セクションで見る。
      */}
      <IngredientOverview rows={ingredientOverview} />

      <AlertsView
        produceAlerts={produceAlerts}
        livestockAlerts={livestockAlerts}
        hasProduceComparison={hasProduceComparison}
        hasLivestockComparison={hasLivestockComparison}
      />

      <LivestockLinkSettings unlinkedIngredients={unlinkedIngredients} linkedIngredients={linkedIngredients} />
    </div>
  );
}

/**
 * 「そもそもこのアラートは何のためにあるか」を説明するヘルプ。
 * ページ上部に常時表示されている説明文(データの出典・東京市場である旨など)とは
 * 粒度を分け、こちらは目的(値上げの見落とし防止)に絞る。
 */
function AlertsHelpButton() {
  return (
    <HelpButton title="仕入れ値アラートとは">
      <p>
        野菜(青果物)や肉(畜産物)の卸売市場の価格が大きく動いた時に知らせる機能です。仕入れ値が上がっているのに気づかず、以前のままの原価率のつもりで営業してしまう、といった見落としを防ぐためのものです。
      </p>
      <p className="mt-3">
        表示される原価率は、市場価格の変動率がそのまま仕入単価に反映されたと仮定した試算であり、実際に仕入単価を変更した結果ではありません。あくまで「相場が動いた」ことに気づくための目安として使ってください。
      </p>
    </HelpButton>
  );
}
