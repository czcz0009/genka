"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { deleteMenu } from "./actions.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { StatusBadge, type BadgeStatus } from "@/components/StatusBadge.tsx";
import { CategoryTabs, replaceCategoryParamInUrl } from "@/components/CategoryTabs.tsx";
import {
  buildCategoryChips,
  categoryTabToParam,
  filterByCategoryTab,
  parseCategoryTab,
  type Category,
  type CategoryTab,
} from "@/lib/categories";

export interface MenuListRow {
  menuId: string;
  menuName: string;
  sellingPrice: number | null;
  totalCost: number;
  costRate: number | null;
  targetCostRate: number;
  overTarget: boolean;
  /** 単価未設定の食材(仕込み品の材料も含む)を使っているか。trueなら原価率を出さない。 */
  hasUnsetIngredient: boolean;
  unsetIngredients: { name: string; viaPrepItemName: string | null }[];
  /** カテゴリ(null=未分類)。タブの絞り込みにだけ使う。 */
  categoryId: string | null;
}

function formatYen(n: number | null): string {
  if (n == null) return "-";
  return `¥${Math.round(n).toLocaleString()}`;
}

function rowStatus(overTarget: boolean, costRate: number | null, hasUnsetIngredient: boolean): BadgeStatus {
  if (hasUnsetIngredient || costRate == null) return "muted";
  return overTarget ? "danger" : "ok";
}

function rowStatusLabel(status: BadgeStatus, hasUnsetIngredient: boolean): string {
  if (status === "danger") return "要対応";
  if (status === "muted") return hasUnsetIngredient ? "計算できていません" : "-";
  return "正常";
}

function formatUnsetIngredientNames(names: { name: string; viaPrepItemName: string | null }[]): string {
  return names.map((n) => (n.viaPrepItemName ? `${n.name}(${n.viaPrepItemName}の材料)` : n.name)).join("、");
}

/**
 * メニュー一覧の本体(見出し行+各メニュー行)。
 *
 * 削除機能追加(配布前QAで発見: 登録ミスや仮データを消せない問題への対応)のため、
 * 以前はサーバーコンポーネント(page.tsx)にそのまま書かれていた一覧描画を
 * クライアントコンポーネントとして切り出した。各行は「タップでメニュー詳細に遷移する」
 * Linkと「削除する」ボタンを兄弟要素にして、削除ボタンがLinkの中に入れ子にならない
 * ようにしている(ボタンをaタグの中に入れるとクリックの挙動が曖昧になるため)。
 */
/** URLに付ける ?category= の部分(「すべて」なら空文字)。 */
function categoryQuery(param: string | null): string {
  return param ? `?category=${encodeURIComponent(param)}` : "";
}

/**
 * ページ上部の「＋ メニューを追加」ボタン。いま開いているタブ(URLの ?category=)を
 * 引き継ぎ、新規登録画面でそのカテゴリを初期値にする。
 */
export function AddMenuLink() {
  const searchParams = useSearchParams();
  const param = searchParams.get("category");
  return (
    <Link
      href={`/menus/new${categoryQuery(param)}`}
      prefetch={false}
      className="rounded px-5 py-3 text-base font-semibold transition-colors"
      style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
    >
      ＋ メニューを追加
    </Link>
  );
}

export function MenusList({
  storeId,
  rows,
  categories,
  initialCategoryParam,
}: {
  storeId: string;
  rows: MenuListRow[];
  /** メニュー用のカテゴリ(並び順どおり)。 */
  categories: Category[];
  /** 画面を開いた時のURLの ?category= の値。 */
  initialCategoryParam: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [tab, setTab] = useState<CategoryTab>(() => parseCategoryTab(initialCategoryParam, categories, { allowPrepTab: false }));
  const activeParam = categoryTabToParam(tab);
  const chips = useMemo(() => buildCategoryChips(items, categories, { includePrepTab: false }), [items, categories]);
  // 未分類のメニューを全部カテゴリ分けし終えると未分類のタブが消えるため、その時は「すべて」に戻す。
  const effectiveTab = useMemo<CategoryTab>(
    () => (chips.some((c) => c.param === activeParam) ? tab : { type: "all" }),
    [chips, activeParam, tab],
  );
  const effectiveParam = categoryTabToParam(effectiveTab);
  const visibleItems = useMemo(() => filterByCategoryTab(items, effectiveTab, categories), [items, effectiveTab, categories]);

  function selectTab(next: CategoryTab) {
    setTab(next);
    replaceCategoryParamInUrl(categoryTabToParam(next));
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  async function handleDelete(row: MenuListRow) {
    if (
      !window.confirm(
        `「${row.menuName}」を削除します。この操作は取り消せません(このメニューの食材構成・販売実績もあわせて削除されます)。よろしいですか?`,
      )
    ) {
      return;
    }
    setDeletingId(row.menuId);
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[row.menuId];
      return next;
    });
    const result = await deleteMenu({ storeId, menuId: row.menuId });
    setDeletingId(null);
    if (!result.success) {
      setDeleteErrors((prev) => ({ ...prev, [row.menuId]: result.error }));
      return;
    }
    setItems((prev) => prev.filter((x) => x.menuId !== row.menuId));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.length > 0 && (
        <CategoryTabs chips={chips} activeParam={effectiveParam} onSelect={(chip) => selectTab(chip.tab)} countUnit="品" ariaLabel="メニューのカテゴリ" />
      )}
      {visibleItems.length === 0 ? (
        <p
          className="rounded border border-dashed px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          このカテゴリのメニューはまだありません。
          <Link href={`/menus/new${categoryQuery(effectiveParam)}`} prefetch={false} className="ml-1 underline underline-offset-2">
            メニューを追加する →
          </Link>
        </p>
      ) : (
        <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          {/*
            状態の列は144px。以前は80pxで、「計算できていません」のバッジが列に収まらず
            左隣の原価率の列(「単価未設定あり」)に重なっていた(2026-10-05修正)。
          */}
          <div
            className="hidden grid-cols-[1fr_96px_96px_128px_144px_88px] border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide sm:grid"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "var(--muted)" }}
          >
            <div>メニュー名</div>
            <div className="text-right" title="売価は税込金額として扱います">
              売価
            </div>
            <div className="text-right">原価</div>
            <div className="text-right">原価率</div>
            <div className="text-right">状態</div>
            <div className="text-right">操作</div>
          </div>
    
          {visibleItems.map((s) => {
            const status = rowStatus(s.overTarget, s.costRate, s.hasUnsetIngredient);
            return (
              <div key={s.menuId} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 px-5 py-4">
                  <Link
                  // 一覧の行数分だけ/menus/[id]がプリフェッチされ裏でSupabaseクエリが
                  // 走ってしまうのを避けるため、ここもprefetchを無効化する
                  href={`/menus/${s.menuId}${categoryQuery(effectiveParam)}`}
                  prefetch={false}
                  className="flex min-w-0 flex-1 flex-col gap-2 text-left transition-colors hover:opacity-80 sm:grid sm:grid-cols-[1fr_96px_96px_128px_144px] sm:items-center sm:gap-0"
                >
                  {/*
                    min-w-0 + break-words: 配布前QAで発見。非常に長いメニュー名(スペースを
                    含まない連続した文字列)を登録すると、1fr列がグリッドの他の固定幅列を
                    押し出して崩れる可能性があったため、この列だけ縮小・折り返しを許可する。
                  */}
                  <div className="min-w-0 break-words font-medium" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
                    {s.menuName}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:contents">
                    <div className="font-mono sm:text-right" style={{ color: "var(--foreground)" }}>
                      {formatYen(s.sellingPrice)}
                    </div>
                    <div className="font-mono sm:text-right" style={{ color: "var(--foreground)" }}>
                      {formatYen(s.totalCost)}
                    </div>
                    {/*
                      不具合修正: 以前は「19.2%(目標25%)」のように原価率と目標値を
                      1行に横並びで詰め込んでおり、桁数によっては固定幅(100px)の
                      グリッド列に収まりきらず、隣の列とテキストが重なって表示される
                      不具合があった(例:「焼き魚定食」の8.7%だけ崩れる、といった
                      桁数依存の再現しにくいレイアウト崩れ)。原価率と目標値を別行に
                      縦積みすることで、桁数に関わらず横方向にはみ出さないようにする。
                    */}
                    <div
                      className="font-mono font-semibold sm:text-right"
                      style={{
                        color:
                          status === "danger" ? "var(--status-danger)" : status === "ok" ? "var(--status-ok)" : "var(--muted-foreground)",
                      }}
                    >
                      <div>{!s.hasUnsetIngredient && s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}</div>
                      <div className="font-sans text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>
                        {s.hasUnsetIngredient ? "単価未設定あり" : `(目標${s.targetCostRate}%)`}
                      </div>
                    </div>
                    <div className="sm:flex sm:justify-end">
                      <StatusBadge status={status} label={rowStatusLabel(status, s.hasUnsetIngredient)} />
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.menuId}
                  className="shrink-0 rounded border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--muted)] disabled:opacity-40"
                  style={{ borderColor: "var(--border)", color: "var(--status-danger)" }}
                >
                  {deletingId === s.menuId ? "削除中…" : "削除する"}
                </button>
              </div>
              {/*
                不具合修正(2026-10-05): 以前はこの案内文が上の横並びの行(メニュー名・削除ボタンと
                同じflex)の中にあり、メニュー名の幅が潰れて縦書きのように崩れていた。
                行の下に独立して表示する(文言は変えない)。
              */}
              {s.hasUnsetIngredient && (
                <p className="px-5 pb-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  計算できていません(未設定: {formatUnsetIngredientNames(s.unsetIngredients)})
                  <Link href="/ingredients" prefetch={false} className="ml-1 underline underline-offset-2">
                    単価を設定する →
                  </Link>
                </p>
              )}
              {deleteErrors[s.menuId] && (
                <div className="px-5 pb-3">
                  <ActionErrorMessage error={deleteErrors[s.menuId]} />
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
