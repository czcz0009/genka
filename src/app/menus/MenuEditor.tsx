"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calcCostRate } from "@/lib/costCalc";
import { saveMenuWithIngredients, type SaveMenuLineInput } from "./actions.ts";

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
}

/** 画面内だけで完結するローカルな食材行。保存ボタンを押すまでサーバーには送らない。 */
export interface LocalLine {
  key: string;
  quantity: string;
  unit: string;
  ingredientName: string;
  unitPrice: number;
  source: { type: "existing"; ingredientId: string } | { type: "new"; name: string; unit: string; purchasePrice: number };
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

/**
 * 仕入単価(1gあたり0.16円、のような小数)専用のフォーマッタ。
 * formatYen(四捨五入)を使うと0.16円や0.7円がすべて「¥0」「¥1」に潰れてしまい、
 * 食材選択の一覧で見分けがつかなくなる不具合があったため分けている。
 */
function formatUnitPrice(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `¥${rounded}`;
}

export function MenuEditor({
  storeId,
  menuId,
  initialName,
  initialSellingPrice,
  initialLines,
  allIngredients,
  targetCostRate,
}: {
  storeId: string;
  menuId?: string;
  initialName: string;
  initialSellingPrice: number | null;
  initialLines: LocalLine[];
  allIngredients: IngredientOption[];
  targetCostRate: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [sellingPrice, setSellingPrice] = useState(initialSellingPrice != null ? String(initialSellingPrice) : "");
  const [lines, setLines] = useState<LocalLine[]>(initialLines);
  const [saving, setSaving] = useState<"save" | "saveAndNew" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * l.unitPrice, 0),
    [lines],
  );
  const sellingPriceNumber = sellingPrice.trim() ? Number(sellingPrice) : null;
  const costRate = calcCostRate(totalCost, sellingPriceNumber);
  const overTarget = costRate != null && costRate > targetCostRate;

  function addLine(line: LocalLine) {
    setLines((prev) => [...prev, line]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleSave(mode: "save" | "saveAndNew") {
    setError(null);
    if (!name.trim()) {
      setError("メニュー名を入力してください");
      return;
    }
    setSaving(mode);
    const lineInputs: SaveMenuLineInput[] = lines.map((l) => ({
      quantity: Number(l.quantity),
      unit: l.unit,
      existingIngredientId: l.source.type === "existing" ? l.source.ingredientId : undefined,
      newIngredient:
        l.source.type === "new"
          ? { name: l.source.name, unit: l.source.unit, purchasePrice: l.source.purchasePrice }
          : undefined,
    }));
    const result = await saveMenuWithIngredients({
      storeId,
      menuId,
      name,
      sellingPrice: sellingPriceNumber,
      lines: lineInputs,
    });
    setSaving(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (mode === "saveAndNew") {
      router.push("/menus/new");
    } else {
      router.push("/menus");
    }
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <label className="flex flex-col gap-2 text-base">
        メニュー名
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 生姜焼き定食"
          className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-2 text-base">
        売価(円)
        <input
          type="number"
          min={0}
          step="1"
          inputMode="decimal"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          placeholder="例: 900(あとで入力してもOK)"
          className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
        />
      </label>

      <div className="flex items-center gap-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
        <span className="text-black/60 dark:text-white/60">原価合計 {formatYen(totalCost)}</span>
        <span
          className={overTarget ? "font-medium text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}
        >
          原価率 {costRate != null ? `${costRate.toFixed(1)}%` : "-"}(目標{targetCostRate}%)
        </span>
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li
              key={l.key}
              className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/10"
            >
              <span className="text-base">
                {l.ingredientName} {l.quantity || 0}
                {l.unit}
              </span>
              <button
                onClick={() => removeLine(l.key)}
                className="text-sm text-black/40 underline underline-offset-2 hover:text-black dark:text-white/40 dark:hover:text-white"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddIngredientForm allIngredients={allIngredients} existingNames={new Set(lines.map((l) => l.ingredientName))} onAdd={addLine} />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => handleSave("save")}
          disabled={saving != null}
          className="flex-1 rounded-lg bg-black px-5 py-4 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {saving === "save" ? "保存中…" : "保存する"}
        </button>
        <button
          onClick={() => handleSave("saveAndNew")}
          disabled={saving != null}
          className="flex-1 rounded-lg border border-black/15 px-5 py-4 text-base font-medium disabled:opacity-40 dark:border-white/20"
        >
          {saving === "saveAndNew" ? "保存中…" : "保存して別のメニューを追加する"}
        </button>
      </div>
    </div>
  );
}

/**
 * 食材の追加フォーム。押した瞬間にローカルのlinesへ追加するだけで、
 * サーバーへは一切問い合わせない(即座に反映される)。
 */
function AddIngredientForm({
  allIngredients,
  existingNames,
  onAdd,
}: {
  allIngredients: IngredientOption[];
  existingNames: Set<string>;
  onAdd: (line: LocalLine) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(allIngredients.length > 0 ? "existing" : "new");
  const [existingId, setExistingId] = useState<string>(allIngredients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newPrice, setNewPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pickedExisting = allIngredients.find((i) => i.id === existingId);
  const effectiveUnit = mode === "existing" ? (pickedExisting?.unit ?? "") : newUnit;

  function handleAdd() {
    setError(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("分量は0より大きい数値で入力してください");
      return;
    }

    if (mode === "existing") {
      if (!pickedExisting) {
        setError("食材を選んでください");
        return;
      }
      onAdd({
        key: nextKey(),
        quantity,
        unit: pickedExisting.unit,
        ingredientName: pickedExisting.name,
        unitPrice: pickedExisting.currentPurchasePrice,
        source: { type: "existing", ingredientId: pickedExisting.id },
      });
    } else {
      const name = newName.trim();
      const price = Number(newPrice);
      if (!name) {
        setError("食材名を入力してください");
        return;
      }
      if (!newUnit.trim()) {
        setError("単位を入力してください");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        setError("仕入単価は0以上の数値で入力してください");
        return;
      }
      onAdd({
        key: nextKey(),
        quantity,
        unit: newUnit,
        ingredientName: name,
        unitPrice: price,
        source: { type: "new", name, unit: newUnit, purchasePrice: price },
      });
      setNewName("");
      setNewPrice("");
    }
    setQuantity("");
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-black/10 p-5 dark:border-white/10">
      <p className="text-base font-medium">食材を追加</p>

      {allIngredients.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-black/60 dark:text-white/60">使う食材は?</p>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex-1 rounded-lg border px-3 py-2.5 ${mode === "existing" ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-black/15 dark:border-white/20"}`}
            >
              登録済みの食材から選ぶ
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`flex-1 rounded-lg border px-3 py-2.5 ${mode === "new" ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-black/15 dark:border-white/20"}`}
            >
              新しく食材を登録する
            </button>
          </div>
        </div>
      )}

      {mode === "existing" ? (
        <div className="flex flex-col gap-2">
          <p className="text-base">食材を選ぶ</p>
          <ExistingIngredientPicker
            allIngredients={allIngredients}
            selectedId={existingId}
            onSelect={(id) => setExistingId(id)}
            alreadyAddedNames={existingNames}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg bg-black/[0.03] p-4 dark:bg-white/[0.04]">
          <p className="text-sm font-medium text-black/70 dark:text-white/70">新しい食材の情報</p>
          <label className="flex flex-col gap-2 text-base">
            食材名
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 豚肉"
              className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-2 text-base">
              仕入単価(円)
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="例: 0.7"
                className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
              />
            </label>
            <label className="flex w-28 flex-col gap-2 text-base">
              単位
              <input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="g"
                className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
              />
            </label>
          </div>
          <p className="text-xs text-black/40 dark:text-white/40">
            仕入単価は「単位1つあたりの金額」です。例:1kg800円のお肉をgで使うなら、800÷1000=0.8円と入力してください。この単位は、下の「このメニューで使う分量」でもそのまま使います。
          </p>
        </div>
      )}

      <label className="flex flex-col gap-2 text-base">
        このメニューで使う分量
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="例: 150"
            className="flex-1 rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
          />
          <span className="min-w-10 text-base text-black/60 dark:text-white/60">{effectiveUnit || "-"}</span>
        </div>
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleAdd}
        className="rounded-lg bg-black px-5 py-4 text-base font-medium text-white dark:bg-white dark:text-black"
      >
        この食材を追加する
      </button>
    </div>
  );
}

/**
 * 既存食材から選ぶための一覧。ネイティブの<select>は開いたポップアップの
 * デザインをアプリ側で制御できず(ダークモードでも白背景で開くなどして
 * 「見づらい」との指摘を受けた)、自前の絞り込みリストに置き換えている。
 */
function ExistingIngredientPicker({
  allIngredients,
  selectedId,
  onSelect,
  alreadyAddedNames,
}: {
  allIngredients: IngredientOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  alreadyAddedNames: Set<string>;
}) {
  const [query, setQuery] = useState("");
  // メニュー名や売価など、この一覧と無関係な入力欄を触るたびに親(MenuEditor)が
  // 再レンダリングされ、そのたびにこの絞り込みが再計算されるのは無駄なため
  // useMemoで、query・allIngredientsが実際に変わった時だけ計算し直すようにする。
  const filtered = useMemo(
    () => (query.trim() ? allIngredients.filter((i) => i.name.includes(query.trim())) : allIngredients),
    [query, allIngredients],
  );
  const selectedIngredient = useMemo(
    () => allIngredients.find((i) => i.id === selectedId),
    [allIngredients, selectedId],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="食材名で絞り込む"
        className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-black/15 dark:border-white/20">
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-black/40 dark:text-white/40">見つかりませんでした</p>
        )}
        {filtered.map((i) => {
          const selected = i.id === selectedId;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => onSelect(i.id)}
              className={`flex w-full items-center justify-between border-b border-black/5 px-4 py-3 text-left text-base last:border-0 dark:border-white/5 ${
                selected
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span>
                {i.name}
                {alreadyAddedNames.has(i.name) && (
                  <span className={`ml-2 text-xs ${selected ? "opacity-70" : "text-black/40 dark:text-white/40"}`}>
                    (追加済み)
                  </span>
                )}
              </span>
              <span className={`text-sm ${selected ? "opacity-70" : "text-black/40 dark:text-white/40"}`}>
                {i.unit}あたり{formatUnitPrice(i.currentPurchasePrice)}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        一覧の中でハイライトされているだけでは「本当に選ばれているか分からない」
        という指摘を受けたため、選んだ食材名をテキストボックスにもはっきり
        表示する(読み取り専用。編集したい場合は上の絞り込み欄や一覧から選び直す)。
      */}
      <label className="flex flex-col gap-1 text-sm text-black/60 dark:text-white/60">
        選択中の食材
        <input
          readOnly
          value={
            selectedIngredient
              ? `${selectedIngredient.name}(${selectedIngredient.unit}あたり${formatUnitPrice(selectedIngredient.currentPurchasePrice)})`
              : "(未選択)"
          }
          className={`rounded-lg border px-4 py-3 text-base ${
            selectedIngredient
              ? "border-black/15 bg-black/[0.03] font-medium text-black dark:border-white/20 dark:bg-white/[0.04] dark:text-white"
              : "border-black/15 bg-transparent text-black/40 dark:border-white/20 dark:text-white/40"
          }`}
        />
      </label>
    </div>
  );
}
