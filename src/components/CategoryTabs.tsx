"use client";

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
  return (
    <div role="tablist" aria-label={ariaLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
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
