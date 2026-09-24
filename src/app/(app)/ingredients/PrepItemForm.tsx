"use client";

import { useMemo, useRef, useState } from "react";
import { MAX_NAME_LENGTH } from "@/lib/normalize.ts";
import { savePrepItem, type IngredientRow, type SavePrepItemComponentInput } from "./actions.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";

const inputStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
  fontFamily: "var(--font-noto-sans-jp)",
};
const INPUT_CLASS = "w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";

export interface PrepItemComponentOption {
  id: string;
  name: string;
  unit: string;
}

interface LocalComponentLine {
  key: string;
  componentId: string;
  componentName: string;
  componentUnit: string;
  quantity: string;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `prep-line-${keySeq}`;
}

function normalizeQuery(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/**
 * 仕込み品(サブレシピ)の登録・編集フォーム。
 *
 * メニュー編集画面(MenuEditor.tsx)の食材選択と近いUX(自由入力+サジェスト)に
 * しているが、こちらは既存の食材・仕込み品から選ぶだけで、その場での新規食材
 * 登録には対応しない(先に「食材」として登録してから仕込み品の材料に選ぶ運用)。
 * MenuEditor.tsx側の食材選択UI・ロジックには一切手を入れていない。
 */
export function PrepItemForm({
  storeId,
  prepItemId,
  initialName,
  initialUnit,
  initialYieldQuantity,
  initialComponents,
  componentOptions,
  onSaved,
}: {
  storeId: string;
  /** 未指定 = 新規作成 */
  prepItemId?: string;
  initialName: string;
  initialUnit: string;
  initialYieldQuantity: number | null;
  initialComponents: { componentId: string; componentName: string; componentUnit: string; quantity: number }[];
  /** 選べる食材・仕込み品の一覧(編集中の仕込み品自身は呼び出し側で除外して渡す)。 */
  componentOptions: PrepItemComponentOption[];
  onSaved: (row: IngredientRow) => void;
}) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState(initialUnit || "ml");
  const [yieldQuantity, setYieldQuantity] = useState(initialYieldQuantity != null ? String(initialYieldQuantity) : "");
  const [lines, setLines] = useState<LocalComponentLine[]>(
    initialComponents.map((c) => ({
      key: nextKey(),
      componentId: c.componentId,
      componentName: c.componentName,
      componentUnit: c.componentUnit,
      quantity: String(c.quantity),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 材料を追加するための小さなサブフォーム(食材名の自由入力+サジェスト)。
  const [nameInput, setNameInput] = useState("");
  const [selectedOption, setSelectedOption] = useState<PrepItemComponentOption | null>(null);
  const [lineQuantity, setLineQuantity] = useState("");
  const [isNameFocused, setIsNameFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedName = nameInput.trim();
  const exactMatch = !selectedOption && trimmedName ? componentOptions.find((o) => o.name === trimmedName) : null;
  const effectiveOption = selectedOption ?? exactMatch;

  const suggestions = useMemo(() => {
    if (effectiveOption) return [];
    const q = normalizeQuery(trimmedName);
    return componentOptions.filter((o) => (q ? normalizeQuery(o.name).includes(q) : true));
  }, [trimmedName, effectiveOption, componentOptions]);
  const showDropdown = isNameFocused && !effectiveOption && suggestions.length > 0;

  function handleNameFocus() {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsNameFocused(true);
  }
  function handleNameBlur() {
    blurTimerRef.current = setTimeout(() => setIsNameFocused(false), 150);
  }

  function handleAddLine() {
    setError(null);
    if (!effectiveOption) {
      setError("材料を選んでください");
      return;
    }
    const qty = Number(lineQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("分量は0より大きい数値で入力してください");
      return;
    }
    if (lines.some((l) => l.componentId === effectiveOption.id)) {
      setError("その材料はすでに追加されています");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        componentId: effectiveOption.id,
        componentName: effectiveOption.name,
        componentUnit: effectiveOption.unit,
        quantity: lineQuantity,
      },
    ]);
    setNameInput("");
    setSelectedOption(null);
    setLineQuantity("");
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("仕込み品名を入力してください");
      return;
    }
    if (!unit.trim()) {
      setError("単位を入力してください");
      return;
    }
    const yieldQuantityNumber = Number(yieldQuantity);
    if (!Number.isFinite(yieldQuantityNumber) || yieldQuantityNumber <= 0) {
      setError("1回の仕込みでできる量は0より大きい数値で入力してください");
      return;
    }
    if (lines.length === 0) {
      setError("材料を1つ以上追加してください");
      return;
    }
    setSaving(true);
    const components: SavePrepItemComponentInput[] = lines.map((l) => ({
      componentId: l.componentId,
      quantity: Number(l.quantity),
      unit: l.componentUnit,
    }));
    const result = await savePrepItem({
      storeId,
      prepItemId,
      name,
      unit,
      yieldQuantity: yieldQuantityNumber,
      components,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved({
      id: result.prepItemId,
      name: name.trim(),
      unit: unit.trim(),
      currentPurchasePrice: 0,
      yieldRatePercent: 100,
      isPrepItem: true,
      yieldQuantity: yieldQuantityNumber,
      components: lines.map((l) => ({
        componentId: l.componentId,
        componentName: l.componentName,
        componentUnit: l.componentUnit,
        quantity: Number(l.quantity),
      })),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          仕込み品名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 出汁"
            maxLength={MAX_NAME_LENGTH}
            className={INPUT_CLASS}
            style={inputStyle}
          />
        </label>
        <label className="flex w-24 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          単位
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ml" className={INPUT_CLASS} style={inputStyle} />
        </label>
      </div>
      <p className="-mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
        メニューでこの仕込み品を使う時の単位です(例: 出汁なら「ml」)。
      </p>

      <label className="flex w-48 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        1回の仕込みでできる量({unit.trim() || "単位"})
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={yieldQuantity}
          onChange={(e) => setYieldQuantity(e.target.value)}
          placeholder="例: 10000"
          className={INPUT_CLASS + " font-mono"}
          style={inputStyle}
        />
      </label>
      <p className="-mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
        例: 10リットル(=10000ml)の出汁が1回でできるなら「10000」と入力してください。
      </p>

      <div className="flex flex-col gap-3 rounded p-4" style={{ background: "var(--muted)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          材料を追加
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setSelectedOption(null);
                setError(null);
              }}
              onFocus={handleNameFocus}
              onBlur={handleNameBlur}
              placeholder="食材名または仕込み品名(クリックすると候補が出ます)"
              className={INPUT_CLASS}
              style={inputStyle}
            />
            {showDropdown && (
              <div className="absolute z-10 max-h-48 w-full overflow-y-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                {suggestions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setSelectedOption(o);
                      setNameInput(o.name);
                      setIsNameFocused(false);
                    }}
                    className="flex w-full items-center justify-between border-b px-4 py-3 text-left text-base transition-colors last:border-0 hover:bg-[color:var(--muted)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    <span style={{ fontFamily: "var(--font-noto-sans-jp)" }}>{o.name}</span>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{o.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex w-28 flex-col gap-2 text-base" style={{ color: "var(--foreground)" }}>
            分量({effectiveOption?.unit ?? "-"})
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={lineQuantity}
              onChange={(e) => setLineQuantity(e.target.value)}
              placeholder="例: 1000"
              className={INPUT_CLASS + " font-mono"}
              style={inputStyle}
            />
          </label>
        </div>
        {!effectiveOption && trimmedName && suggestions.length === 0 && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            一致する食材・仕込み品が見つかりません。先に「食材」として登録してから選んでください。
          </p>
        )}
        <button
          type="button"
          onClick={handleAddLine}
          className="self-start rounded border px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          この材料を追加する
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          材料{lines.length > 0 ? `(${lines.length}件)` : ""}
        </p>
        {lines.length === 0 ? (
          <p className="rounded border border-dashed px-4 py-4 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            まだ材料が追加されていません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-3 rounded border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <span className="text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                  {l.componentName} {l.quantity}
                  {l.componentUnit}
                </span>
                <button
                  onClick={() => removeLine(l.key)}
                  className="shrink-0 rounded px-3 py-2 text-sm underline underline-offset-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <ActionErrorMessage error={error} />}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {saving ? "保存中…" : "この仕込み品を保存する"}
      </button>
    </div>
  );
}
