import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore, getCategories } from "@/lib/store";
import { countItemsByCategory, sortCategories, type CategoryKind } from "@/lib/categories";
import { PageHeader } from "@/components/PageHeader.tsx";
import { StoreLoadError } from "@/components/StoreLoadError.tsx";
import { CategoryEditor } from "./CategoryEditor.tsx";

/**
 * カテゴリの編集画面(メニュー用・食材用の切り替え)。
 * 入口は、メニュー一覧・食材一覧のタブ行の「カテゴリを編集」と、設定画面。
 * 件数(◯品・◯件)は、一覧のタブの数字と同じ数え方(countItemsByCategory)にしている。
 */
const KIND_LABEL: Record<CategoryKind, { title: string; list: string; listHref: string; unit: string }> = {
  menu: { title: "メニューのカテゴリ", list: "メニュー一覧", listHref: "/menus", unit: "品" },
  ingredient: { title: "食材のカテゴリ", list: "食材一覧", listHref: "/ingredients", unit: "件" },
};

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const { kind: kindRaw } = await searchParams;
  const kind: CategoryKind = kindRaw === "ingredient" ? "ingredient" : "menu";
  const label = KIND_LABEL[kind];

  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader eyebrow="カテゴリ" title="カテゴリの編集" />
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

  // 件数を数えるのに必要な列だけを取得する(カテゴリ・仕込み品かどうか)
  const [allCategories, { data: items, error }] = await Promise.all([
    getCategories(supabase),
    kind === "menu"
      ? supabase.from("menus").select("category_id").eq("store_id", store.id)
      : supabase.from("ingredients").select("category_id, is_prep_item").eq("store_id", store.id),
  ]);
  if (error) {
    return (
      <div className="max-w-4xl space-y-6 p-6 md:p-8">
        <StoreLoadError />
      </div>
    );
  }
  const categories = sortCategories(allCategories.filter((c) => c.kind === kind));
  const counts = countItemsByCategory(
    (items ?? []).map((i) => ({
      categoryId: (i as { category_id: string | null }).category_id,
      isPrepItem: (i as { is_prep_item?: boolean }).is_prep_item === true,
    })),
    categories,
  );

  return (
    <div className="max-w-2xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="カテゴリ"
        title="カテゴリの編集"
        description={`${label.list}のタブに使うカテゴリを、追加・名前の変更・並び替え・削除できます。`}
      />

      <div className="flex gap-2" role="tablist" aria-label="カテゴリの種類">
        {(["menu", "ingredient"] as const).map((k) => {
          const active = k === kind;
          return (
            <Link
              key={k}
              href={`/categories?kind=${k}`}
              prefetch={false}
              role="tab"
              aria-selected={active}
              className="flex-1 rounded border px-3 py-2.5 text-center text-sm transition-colors"
              style={
                active
                  ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
                  : { borderColor: "var(--border)", color: "var(--foreground)" }
              }
            >
              {k === "menu" ? "メニュー用" : "食材用"}
            </Link>
          );
        })}
      </div>

      <CategoryEditor
        key={kind}
        storeId={store.id}
        kind={kind}
        unit={label.unit}
        initialCategories={categories}
        initialCounts={Object.fromEntries(counts)}
      />

      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        「すべて」「未分類」{kind === "ingredient" ? "「仕込み品」" : ""}のタブは固定のため、ここには表示されません。
      </p>

      <Link href={label.listHref} prefetch={false} className="inline-block text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
        ← {label.list}に戻る
      </Link>
    </div>
  );
}
