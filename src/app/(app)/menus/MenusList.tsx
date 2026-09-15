"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteMenu } from "./actions.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { StatusBadge, type BadgeStatus } from "@/components/StatusBadge.tsx";

export interface MenuListRow {
  menuId: string;
  menuName: string;
  sellingPrice: number | null;
  totalCost: number;
  costRate: number | null;
  targetCostRate: number;
  overTarget: boolean;
}

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

/**
 * メニュー一覧の本体(見出し行+各メニュー行)。
 *
 * 削除機能追加(配布前QAで発見: 登録ミスや仮データを消せない問題への対応)のため、
 * 以前はサーバーコンポーネント(page.tsx)にそのまま書かれていた一覧描画を
 * クライアントコンポーネントとして切り出した。各行は「タップでメニュー詳細に遷移する」
 * Linkと「削除する」ボタンを兄弟要素にして、削除ボタンがLinkの中に入れ子にならない
 * ようにしている(ボタンをaタグの中に入れるとクリックの挙動が曖昧になるため)。
 */
export function MenusList({ storeId, rows }: { storeId: string; rows: MenuListRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
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
    <div className="overflow-hidden rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div
        className="hidden grid-cols-[1fr_96px_96px_128px_80px_88px] border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide sm:grid"
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

      {items.map((s) => {
        const status = rowStatus(s.overTarget, s.costRate);
        return (
          <div key={s.menuId} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 px-5 py-4">
              <Link
              // 一覧の行数分だけ/menus/[id]がプリフェッチされ裏でSupabaseクエリが
              // 走ってしまうのを避けるため、ここもprefetchを無効化する
              href={`/menus/${s.menuId}`}
              prefetch={false}
              className="flex min-w-0 flex-1 flex-col gap-2 text-left transition-colors hover:opacity-80 sm:grid sm:grid-cols-[1fr_96px_96px_128px_80px] sm:items-center sm:gap-0"
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
                  <div>{s.costRate != null ? `${s.costRate.toFixed(1)}%` : "-"}</div>
                  <div className="font-sans text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>
                    (目標{s.targetCostRate}%)
                  </div>
                </div>
                <div className="sm:flex sm:justify-end">
                  <StatusBadge status={status} label={rowStatusLabel(status)} />
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
          {deleteErrors[s.menuId] && (
            <div className="px-5 pb-3">
              <ActionErrorMessage error={deleteErrors[s.menuId]} />
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
