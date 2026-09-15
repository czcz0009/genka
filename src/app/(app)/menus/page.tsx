import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getStoreData } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient } from "@/lib/menuRanking";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";
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
  const rankingIngredients = (storeData?.ingredients ?? []).map((i) => ({
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

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="メニュー管理"
          title="メニュー一覧"
          description="登録済みのメニューと、それぞれの原価・原価率です。原価率は「原価 ÷ 売価」で、低いほど利益が残ります。タップすると食材の追加・編集ができます。"
        />
        <Link
          href="/menus/new"
          prefetch={false}
          className="shrink-0 rounded px-5 py-3 text-base font-semibold transition-colors"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          ＋ メニューを追加
        </Link>
      </div>

      <MenusList storeId={store.id} rows={rows} />
    </div>
  );
}
