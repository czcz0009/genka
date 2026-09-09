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
  const [existingId, setExistingId] = useState(allIngredients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newPrice, setNewPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await addIngredientToMenu({
      storeId,
      menuId,
      quantity: Number(quantity),
      unit,
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
    <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-lg border border-black/10 p-5 dark:border-white/10">
      <p className="text-base font-medium">食材を追加</p>

      {allIngredients.length > 0 && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`rounded-full px-3 py-1.5 ${mode === "existing" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}
          >
            登録済みの食材から選ぶ
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`rounded-full px-3 py-1.5 ${mode === "new" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}
          >
            新しい食材を登録する
          </button>
        </div>
      )}

      {mode === "existing" ? (
        <label className="flex flex-col gap-2 text-base">
          食材
          <select
            value={existingId}
            onChange={(e) => {
              setExistingId(e.target.value);
              const picked = allIngredients.find((i) => i.id === e.target.value);
              if (picked) setUnit(picked.unit);
            }}
            className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
          >
            {allIngredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}({i.unit}あたり{formatYen(i.currentPurchasePrice)})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
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
            仕入単価は「単位1つあたりの金額」です。例:1kg800円のお肉をgで使うなら、800÷1000=0.8円と入力してください。
          </p>
        </>
      )}

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base">
          このメニューで使う分量
          <input
            type="number"
            min={0}
            step="0.01"
            required
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="例: 150"
            className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-base">
          単位
          <input
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g"
            className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
          />
        </label>
      </div>

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
