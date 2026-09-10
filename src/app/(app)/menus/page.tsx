import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { buildMenuRanking, type RankingMenu, type RankingMenuIngredient } from "@/lib/menuRanking";
import { StartHerePrompt } from "@/components/StartHerePrompt.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { StatusBadge, type BadgeStatus } from "@/components/StatusBadge.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "メニュー一覧",
};

function formatYen(n: number | null): string {
  if (n == null) return "-";
  return `¥${Math.round(n).toLocaleString()}`;
}

function rowStatus(overTarget: boolean, costRate: number | null): BadgeStatus {
  if (costRate == null) return "muted";
  return overTarget ? "danger" : "ok";
}

function rowStatusLabel(status: BadgeStatus): string {
  if (status === "danger") return "要対応";
  if (status === "muted") return "-";
  return "正常";
}

export default async function MenusPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー管理" title="メニュー一覧" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Supabaseが未接続のため、この画面はまだ利用できません。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user || !supabase) redirect("/login");

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name, selling_price, target_cost_rate, created_at")
    .eq("store_id", store.id)
    .order("created_at", { ascending: true });

  if (!menus || menus.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="メニュー管理" title="メニュー一覧" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          登録したメニューの原価・原価率がここに一覧で表示されます。
        </p>
        <StartHerePrompt />
      </div>
    );
  }

  // メニュー一覧に必要なのは「原価・原価率」だけで、販売実績は使わないため
  // sales は渡さない(渡さなければ利益貢献度は常に0/null扱いになり、ソート順に
  // 影響しない=登録順のまま表示される)。
  const [{ data: menuIngredients }, { data: ingredients }] = await Promise.all([
    supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity, menus!inner(store_id)")
      .eq("menus.store_id", store.id),
    supabase.from("ingredients").select("id, current_purchase_price").eq("store_id", store.id),
  ]);

  const rankingMenus: RankingMenu[] = menus.map((m) => ({
    id: m.id,
    name: m.name,
    sellingPrice: m.selling_price,
    targetCostRate: m.target_cost_rate,
  }));
  const rankingMenuIngredients: RankingMenuIngredient[] = (menuIngredients ?? []).map((mi) => ({
    menuId: mi.menu_id,
    ingredientId: mi.ingredient_id,
    quantity: mi.quantity,
  }));
  const rankingIngredients = (ingredients ?? []).map((i) => ({
    id: i.id,
    currentPurchasePrice: i.current_purchase_price,
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
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
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

      <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div
          className="hidden grid-cols-[1fr_100px_100px_100px_80px] border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide sm:grid"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "var(--muted)" }}
        >
          <div>メニュー名</div>
          <div className="text-right">売価</div>
          <div className="text-right">原価</div>
          <div className="text-right">原価率</div>
          <div className="text-right">状態</div>
        </div>

        {rows.map((s) => {
          const status = rowStatus(s.overTarget, s.costRate);
          return (
            <Link
              key={s.menuId}
              // 一覧の行数分だけ/menus/[id]がプリフェッチされ裏でSupabaseクエリが
              // 走ってしまうのを避けるため、ここもprefetchを無効化する
              href={`/menus/${s.menuId}`}
              prefetch={false}
              className="flex flex-col gap-2 border-b px-5 py-4 text-left transition-colors last:border-0 hover:bg-[color:var(--muted)]/50 sm:grid sm:grid-cols-[1fr_100px_100px_100px_80px] sm:items-center sm:gap-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="font-medium" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
                {s.menuName}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:contents">
                <div className="font-mono sm:text-right" style={{ color: "var(--foreground)" }}>
                  {formatYen(s.sellingPrice)}
                </div>
                <div className="font-mono sm:text-right" style={{ color: "var(--foreground)" }}>
                  {formatYen(s.totalCost)}
                </div>
                <div
                  className="font-mono font-semibold sm:text-right"
                  style={{
                    color:
                      status === "danger" ? "var(--status-danger)" : status === "ok" ? "var(--status-ok)" : "var(--muted-foreground)",
                  }}
                >
                  {s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}
                  <span className="ml-1 font-sans text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>
                    (目標{s.targetCostRate}%)
                  </span>
                </div>
                <div className="sm:flex sm:justify-end">
                  <StatusBadge status={status} label={rowStatusLabel(status)} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
