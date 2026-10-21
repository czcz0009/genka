"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CategoryChip } from "@/lib/categories";

/**
 * メニュー一覧・食材一覧の上部に出す、カテゴリのタブ(チップ)。
 *
 * スマホでも崩れないよう、折り返さずに横スクロールさせる(チップが増えても
 * 一覧の表示位置が下にずれない)。選択中のチップは、既存のタブボタンと同じ
 * primary色の塗りつぶしにする。
 *
 * 長いカテゴリ名(上限20文字)は、チップの中では10文字分程度で「…」と省略する
 * (375pxで1つのチップが画面幅を超えないように。件数は省略しない)。
 * スマホにはマウスを乗せて全文を見る手段がないため、カテゴリのタブを選んでいる間は、
 * タブ行の下に全文を見出しとして出す(長い場合は折り返す)。
 */
export function CategoryTabs({
  chips,
  activeParam,
  onSelect,
  ariaLabel,
  countUnit,
  editHref,
}: {
  chips: CategoryChip[];
  activeParam: string | null;
  onSelect: (chip: CategoryChip) => void;
  ariaLabel: string;
  /** 件数の単位(メニューは「品」、食材は「件」。各一覧画面の表記に合わせる) */
  countUnit: string;
  /** 「カテゴリを編集」の遷移先(カテゴリの編集画面。一覧と同じ種類を開く) */
  editHref: string;
}) {
  const activeChip = chips.find((chip) => chip.param === activeParam);
  const listRef = useRef<HTMLDivElement>(null);
  // URLで指定されたタブ(例: 詳細画面から戻った時)が右側の見えない位置にあっても
  // 分かるよう、最初の表示時だけ選択中のタブまで横スクロールする(縦方向には動かさない)。
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const overflowRight = active.getBoundingClientRect().right - list.getBoundingClientRect().right;
    if (overflowRight > 0) list.scrollLeft += overflowRight + 16;
    // 最初の表示時だけ動かす(タブを押すたびに動くと、押した位置がずれて操作しにくいため)
  }, []);

  return (
    <div>
      <div ref={listRef} role="tablist" aria-label={ariaLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {chips.map((chip) => {
          const active = chip.param === activeParam;
          return (
            <button
              key={chip.param ?? "__all__"}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${chip.label} ${chip.count}${countUnit}`}
              title={chip.label}
              onClick={() => onSelect(chip)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors"
              style={{
                fontFamily: "var(--font-noto-sans-jp)",
                ...(active
                  ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
                  : { background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" }),
              }}
            >
              <span className="max-w-[10em] truncate">{chip.label}</span>
              <span
                className="font-mono text-xs"
                style={{ color: active ? "var(--primary-foreground)" : "var(--muted-foreground)", opacity: active ? 0.85 : 1 }}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
      {/* 選択中のカテゴリの全文(左)と、カテゴリの編集画面への入口(右)。タブ行は横スクロールするため、入口はその外に置く */}
      <div className="mt-1 mb-2 flex items-start justify-between gap-3">
        {activeChip?.tab.type === "category" ? (
          <p
            className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            {`${activeChip.label}(${activeChip.count}${countUnit})`}
          </p>
        ) : (
          <span />
        )}
        <Link
          href={editHref}
          prefetch={false}
          className="shrink-0 whitespace-nowrap text-xs underline underline-offset-2"
          style={{ color: "var(--accent)" }}
        >
          カテゴリを編集
        </Link>
      </div>
    </div>
  );
}

/**
 * 画面を再読み込みせずに、URLの ?category= だけを書き換える
 * (戻る・再読み込み・詳細画面からの戻りで同じタブを開けるようにするため)。
 * router.replaceだとサーバーへの再取得が走るため、履歴APIで書き換える。
 */
export function replaceCategoryParamInUrl(param: string | null) {
  const url = new URL(window.location.href);
  if (param) url.searchParams.set("category", param);
  else url.searchParams.delete("category");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
