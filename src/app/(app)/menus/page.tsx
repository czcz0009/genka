import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient } from "@/lib/menuRanking";
import { withResolvedPrepItemPrices } from "@/lib/prepItemCost";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
import { Notice } from "@/components/Notice.tsx";
import { MenusList } from "./MenusList.tsx";

export const metadata: Metadata = {
  title: "メニュー一覧",
};

export default async function MenusPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー管理" title="メニュー一覧" />
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

  // menus・ingredients・menu_ingredientsを1回のRPC(get_store_data)でまとめて
  // 取得する(以前は最大3クエリの並列取得だったが、往復そのものを1回に減らす)。
  // メニュー一覧に必要なのは「原価・原価率」だけで、販売実績は使わないため
  // sales は渡さない(渡さなければ利益貢献度は常に0/null扱いになり、ソート順に
  // 影響しない=登録順のまま表示される)。
  const storeData = await getStoreData(supabase);
  const menus = storeData?.menus ?? [];

  if (menus.length === 0) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー管理" title="メニュー一覧" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          登録したメニューの原価・原価率がここに一覧で表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

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
  const resolvedIngredients = withResolvedPrepItemPrices(
    storeData?.ingredients ?? [],
    storeData?.prepItemComponents ?? [],
  );
  const rankingIngredients = resolvedIngredients.map((i) => ({
    id: i.id,
    currentPurchasePrice: i.currentPurchasePrice,
    yieldRatePercent: i.yieldRatePercent,
  }));

  const summaries = buildMenuRanking({
    menus: rankingMenus,
    menuIngredients: rankingMenuIngredients,
    ingredients: rankingIngredients,
    sales: [],
    defaultTargetCostRate: store.defaultTargetCostRate,
  });
  // buildMenuRanking は利益貢献度順に並び替えるため、登録順に戻す
  const orderById = new Map(menus.map((m, idx) => [m.id, idx]));
  const rows = [...summaries].sort((a, b) => (orderById.get(a.menuId) ?? 0) - (orderById.get(b.menuId) ?? 0));
  const overTargetCount = rows.filter((r) => r.overTarget).length;

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="メニュー管理"
          title="メニュー一覧"
          description="登録済みのメニューと、それぞれの原価・原価率です。原価率は「原価 ÷ 売価」で、低いほど利益が残ります。タップすると食材の追加・編集ができます。"
        />
        <div className="flex shrink-0 gap-3">
          <Link
            href="/import"
            prefetch={false}
            className="rounded border px-5 py-3 text-base font-semibold transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            Excelから取り込む
          </Link>
          <Link
            href="/menus/new"
            prefetch={false}
            className="rounded px-5 py-3 text-base font-semibold transition-colors"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            ＋ メニューを追加
          </Link>
        </div>
      </div>

      {/*
        「今見直すべきメニュー」画面と役割が重複しているように見える、という
        指摘への対応。この一覧はあくまで登録順の全件表示で、優先度付け・値上げ
        目安額はランキング画面側の役割であることをここから明示的にリンクする。
      */}
      {overTargetCount > 0 && (
        <Notice tone="warn">
          {overTargetCount}品が目標原価率を超えています。
          <Link href="/ranking" prefetch={false} className="ml-1 underline underline-offset-2" style={{ color: "inherit" }}>
            今見直すべきメニューを優先度順に見る →
          </Link>
        </Notice>
      )}

      <MenusList storeId={store.id} rows={rows} />
    </div>
  );
}
