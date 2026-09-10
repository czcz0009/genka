"use client";

import { useState } from "react";

export interface PickerOption {
  value: string;
  label: string;
  /** 右側に薄く表示する補足情報(価格など)。無ければ表示しない。 */
  hint?: string;
}

/**
 * ネイティブの<select>を置き換える、検索絞り込みつきの選択リスト。
 *
 * ネイティブの<select>は開いたポップアップの見た目をアプリ側で制御できず、
 * ダークモードでも白背景で開く・選択結果が反映されたか分かりにくいといった
 * 指摘を受けたため(最初は食材追加画面で対応)、アプリ内の全ての選択UIを
 * この体験に統一する。
 *
 * 選んだ結果は、一覧内のハイライトだけでなく読み取り専用のテキストボックスにも
 * 表示する(「選んだものが反映されているか分からない」という指摘への対応)。
 */
export function SearchablePicker({
  options,
  value,
  onChange,
  searchPlaceholder = "絞り込む",
  selectedLabelPrefix = "選択中",
  emptyLabel = "(未選択)",
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  selectedLabelPrefix?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  // 全角/半角・大文字小文字のゆれを吸収して絞り込む(例:「A4」で入力しても
  // 「Ａ４」という表記の項目が見つかるように)。
  const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
  const trimmedQuery = normalize(query.trim());
  const filtered = trimmedQuery ? options.filter((o) => normalize(o.label).includes(trimmedQuery)) : options;
  const selected = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="rounded border px-4 py-3 text-base focus:outline-none focus:ring-2"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          fontFamily: "var(--font-noto-sans-jp)",
        }}
      />
      <div className="max-h-56 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
        {filtered.length === 0 && (
          <p className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
            見つかりませんでした
          </p>
        )}
        {filtered.map((o) => {
          const isSelected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="flex w-full items-center justify-between border-b px-4 py-3 text-left text-base transition-colors last:border-0"
              style={{
                borderColor: "var(--border)",
                background: isSelected ? "var(--primary)" : "transparent",
                color: isSelected ? "var(--primary-foreground)" : "var(--foreground)",
                fontFamily: "var(--font-noto-sans-jp)",
              }}
            >
              <span>{o.label}</span>
              {o.hint && (
                <span
                  className="font-mono text-sm"
                  style={{ color: isSelected ? "var(--primary-foreground)" : "var(--muted-foreground)", opacity: isSelected ? 0.8 : 1 }}
                >
                  {o.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 一覧内のハイライトだけでは「本当に選ばれているか分からない」という
          指摘を受けたため、選んだ内容をテキストボックスにもはっきり表示する。 */}
      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {selectedLabelPrefix}
        <input
          readOnly
          value={selected ? selected.label : emptyLabel}
          className="rounded border px-4 py-3 text-base"
          style={
            selected
              ? { borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)", fontWeight: 500 }
              : { borderColor: "var(--border)", background: "transparent", color: "var(--muted-foreground)" }
          }
        />
      </label>
    </div>
  );
}
