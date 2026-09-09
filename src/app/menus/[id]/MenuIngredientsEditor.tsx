"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addIngredientToMenu, removeMenuIngredient, updateMenuSellingPrice } from "../actions.ts";

interface Line {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
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

export function MenuIngredientsEditor({
  storeId,
  menuId,
  sellingPrice,
  totalCost,
  costRate,
  targetCostRate,
  lines,
  allIngredients,
}: {
  storeId: string;
  menuId: string;
  sellingPrice: number | null;
  totalCost: number;
  costRate: number | null;
  targetCostRate: number;
  lines: Line[];
  allIngredients: IngredientOption[];
}) {
  const router = useRouter();
  const overTarget = costRate != null && costRate > targetCostRate;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <SellingPriceCard
        menuId={menuId}
        sellingPrice={sellingPrice}
        totalCost={totalCost}
        costRate={costRate}
        targetCostRate={targetCostRate}
        overTarget={overTarget}
        onSaved={() => router.refresh()}
      />

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 text-base dark:border-white/10"
            >
              <span>
                {line.ingredientName}
                <span className="ml-2 text-black/50 dark:text-white/50">
                  {line.quantity}
                  {line.unit}
                </span>
              </span>
              <RemoveButton menuIngredientId={line.id} onRemoved={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}

      <AddIngredientForm
        storeId={storeId}
        menuId={menuId}
        allIngredients={allIngredients}
        onAdded={() => router.refresh()}
      />

      {lines.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-black/10 pt-6 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            食材の追加が終わったら、次に進めます。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/menus/new"
              className="flex-1 rounded-lg border border-black/15 px-5 py-3 text-center text-base dark:border-white/20"
            >
              + 別のメニューを追加する
            </Link>
            <Link
              href="/ranking"
              className="flex-1 rounded-lg bg-black px-5 py-3 text-center text-base font-medium text-white dark:bg-white dark:text-black"
            >
              完了してランキングを見る
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SellingPriceCard({
  menuId,
  sellingPrice,
  totalCost,
  costRate,
  targetCostRate,
  overTarget,
  onSaved,
}: {
  menuId: string;
  sellingPrice: number | null;
  totalCost: number;
  costRate: number | null;
  targetCostRate: number;
  overTarget: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(sellingPrice != null ? String(sellingPrice) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateMenuSellingPrice({ menuId, sellingPrice: value.trim() ? Number(value) : null });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2 text-base">
          売価(円)
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: 900"
            className="w-32 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
          />
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-40 dark:border-white/20"
        >
          {saving ? "保存中…" : "売価を保存"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-black/60 dark:text-white/60">原価合計 {formatYen(totalCost)}</span>
        <span className={overTarget ? "font-semibold text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}>
          原価率 {costRate != null ? `${costRate.toFixed(1)}%` : "売価未入力"}
          <span className="ml-1 text-black/40 dark:text-white/40">(目標{targetCostRate}%)</span>
        </span>
      </div>
    </div>
  );
}

function RemoveButton({ menuIngredientId, onRemoved }: { menuIngredientId: string; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);
  return (
    <button
      onClick={async () => {
        setRemoving(true);
        await removeMenuIngredient({ menuIngredientId });
        onRemoved();
      }}
      disabled={removing}
      className="text-sm text-black/40 underline underline-offset-2 hover:text-red-600 disabled:opacity-40 dark:text-white/40 dark:hover:text-red-400"
    >
      削除
    </button>
  );
}

function AddIngredientForm({
  storeId,
  menuId,
  allIngredients,
  onAdded,
}: {
  storeId: string;
  menuId: string;
  allIngredients: IngredientOption[];
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(allIngredients.length > 0 ? "existing" : "new");
  const [existingId, setExistingId] = useState<string>(allIngredients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newPrice, setNewPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickedExisting = allIngredients.find((i) => i.id === existingId);
  // 分量の単位は「使う食材」で自動的に決まる(既存食材ならその単位、新規食材なら
  // 今入力している単位)。以前は分量用にも別の単位入力欄があり、
  // 「単位が2つあってどっちを触ればいいか分からない」という指摘を受けて統合した。
  const effectiveUnit = mode === "existing" ? (pickedExisting?.unit ?? "") : newUnit;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "existing" && !existingId) {
      setError("食材を選んでください");
      return;
    }
    setSaving(true);
    const result = await addIngredientToMenu({
      storeId,
      menuId,
      quantity: Number(quantity),
      unit: effectiveUnit,
      existingIngredientId: mode === "existing" ? existingId : undefined,
      newIngredient:
        mode === "new" ? { name: newName, unit: newUnit, purchasePrice: Number(newPrice) } : undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNewName("");
    setNewPrice("");
    setQuantity("");
    onAdded();
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-col gap-5 rounded-lg border border-black/10 p-5 dark:border-white/10">
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
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg bg-black/[0.03] p-4 dark:bg-white/[0.04]">
          <p className="text-sm font-medium text-black/70 dark:text-white/70">新しい食材の情報</p>
          <label className="flex flex-col gap-2 text-base">
            食材名
            <input
              required
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
                required
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
                required
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
            required
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
        type="submit"
        disabled={saving}
        className="rounded-lg bg-black px-5 py-4 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {saving ? "追加中…" : "この食材を追加する"}
      </button>
    </form>
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
}: {
  allIngredients: IngredientOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? allIngredients.filter((i) => i.name.includes(query.trim()))
    : allIngredients;

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
              <span>{i.name}</span>
              <span className={`text-sm ${selected ? "opacity-70" : "text-black/40 dark:text-white/40"}`}>
                {i.unit}あたり{formatUnitPrice(i.currentPurchasePrice)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
