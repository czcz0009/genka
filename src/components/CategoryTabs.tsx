"use client";

import { useEffect, useRef } from "react";
import type { CategoryChip } from "@/lib/categories";

/**
 * メニュー一覧・食材一覧の上部に出す、カテゴリのタブ(チップ)。
 *
 * スマホでも崩れないよう、折り返さずに横スクロールさせる(チップが増えても
 * 一覧の表示位置が下にずれない)。選択中のチップは、既存のタブボタンと同じ
 * primary色の塗りつぶしにする。
 */
export function CategoryTabs({
  chips,
  activeParam,
  onSelect,
  ariaLabel,
}: {
  chips: CategoryChip[];
  activeParam: string | null;
  onSelect: (chip: CategoryChip) => void;
  ariaLabel: string;
}) {
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
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {chips.map((chip) => {
        const active = chip.param === activeParam;
        return (
          <button
            key={chip.param ?? "__all__"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(chip)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors"
            style={{
              fontFamily: "var(--font-noto-sans-jp)",
              ...(active
                ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
                : { background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" }),
            }}
          >
            <span>{chip.label}</span>
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
