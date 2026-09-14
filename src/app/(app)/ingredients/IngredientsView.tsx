"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createIngredient, updateIngredient, type IngredientRow } from "./actions.ts";

function formatUnitPrice(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `¥${rounded}`;
}

/**
 * 「1kgで800円」のようなパック単位の仕入れ情報から、単位1つあたりの単価を計算する。
 * メニュー登録画面(MenuEditor.tsx)の同名ロジックと同じ考え方(独立実装)。
 */
function computeUnitPriceFromPackage(purchaseQuantity: number, purchasePrice: number): number | null {
  if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) return null;
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return null;
  return purchasePrice / purchaseQuantity;
}

const inputStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
  fontFamily: "var(--font-noto-sans-jp)",
};
const INPUT_CLASS = "rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded border px-3 py-2.5 text-sm transition-colors"
      style={
        active
          ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
          : { borderColor: "var(--border)", color: "var(--foreground)" }
      }
    >
      {children}
    </button>
  );
}

/**
 * 価格入力欄(仕入れ数量・仕入れ価格からの自動計算 / 直接入力の切り替え)。
 * MenuEditor.tsxの食材追加フォームと同じ操作感にしている。
 */
function usePriceInput(initialPrice?: number) {
  const [priceMode, setPriceMode] = useState<"calc" | "direct">("calc");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchasePriceTotal, setPurchasePriceTotal] = useState("");
  const [directPrice, setDirectPrice] = useState(initialPrice != null ? String(initialPrice) : "");

  const computedUnitPrice = computeUnitPriceFromPackage(Number(purchaseQuantity), Number(purchasePriceTotal));
  const resolvedPrice = priceMode === "calc" ? computedUnitPrice : directPrice.trim() ? Number(directPrice) : null;

  function reset() {
    setPriceMode("calc");
    setPurchaseQuantity("");
    setPurchasePriceTotal("");
    setDirectPrice("");
  }

  return {
    priceMode,
    setPriceMode,
    purchaseQuantity,
    setPurchaseQuantity,
    purchasePriceTotal,
    setPurchasePriceTotal,
    directPrice,
    setDirectPrice,
    computedUnitPrice,
    resolvedPrice,
    reset,
  };
}

function PriceInputFields({
  unit,
  price,
}: {
  unit: string;
  price: ReturnType<typeof usePriceInput>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 text-sm">
        <TabButton active={price.priceMode === "calc"} onClick={() => price.setPriceMode("calc")}>
          仕入れ価格から計算する
        </TabButton>
        <TabButton active={price.priceMode === "direct"} onClick={() => price.setPriceMode("direct")}>
          単価を直接入力する
        </TabButton>
      </div>

      {price.priceMode === "calc" ? (
        <>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              仕入れ数量({unit.trim() || "単位"})
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price.purchaseQuantity}
                onChange={(e) => price.setPurchaseQuantity(e.target.value)}
                placeholder="例: 1000"
                className={INPUT_CLASS + " font-mono"}
                style={inputStyle}
              />
            </label>
            <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              仕入れ価格(円)
              <input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={price.purchasePriceTotal}
                onChange={(e) => price.setPurchasePriceTotal(e.target.value)}
                placeholder="例: 800"
                className={INPUT_CLASS + " font-mono"}
                style={inputStyle}
              />
            </label>
          </div>
          <div
            className="rounded px-4 py-3 text-sm"
            style={{ background: "var(--muted)", color: price.computedUnitPrice != null ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {price.computedUnitPrice != null
              ? `→ ${unit.trim() || "単位"}1つあたり ${formatUnitPrice(price.computedUnitPrice)}`
              : "仕入れ数量と仕入れ価格を入力すると、単価を自動で計算します"}
          </div>
        </>
      ) : (
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          仕入単価(円)
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={price.directPrice}
            onChange={(e) => price.setDirectPrice(e.target.value)}
            placeholder="例: 0.7"
            className={INPUT_CLASS + " font-mono"}
            style={inputStyle}
          />
        </label>
      )}
    </div>
  );
}

function AddIngredientForm({ storeId, onAdded }: { storeId: string; onAdded: (i: IngredientRow) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const price = usePriceInput();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("食材名を入力してください");
      return;
    }
    if (!unit.trim()) {
      setError("単位を入力してください");
      return;
    }
    if (price.resolvedPrice == null || price.resolvedPrice < 0) {
      setError(
        price.priceMode === "calc" ? "仕入れ数量と仕入れ価格を入力してください" : "仕入単価は0以上の数値で入力してください",
      );
      return;
    }
    setSaving(true);
    const result = await createIngredient({ storeId, name: trimmedName, unit: unit.trim(), purchasePrice: price.resolvedPrice });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onAdded(result.ingredient);
    setJustAdded(result.ingredient.name);
    setName("");
    setUnit("g");
    price.reset();
  }

  return (
    <div className="flex flex-col gap-4 rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <p className="text-base font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        食材を追加
      </p>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          食材名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 豚肉"
            className={INPUT_CLASS}
            style={inputStyle}
          />
        </label>
        <label className="flex w-24 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          単位
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g" className={INPUT_CLASS} style={inputStyle} />
        </label>
      </div>

      <PriceInputFields unit={unit} price={price} />

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
      {justAdded && !error && (
        <p className="text-sm font-medium" style={{ color: "var(--status-ok)" }}>
          ✓ 「{justAdded}」を追加しました
        </p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={saving}
        className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {saving ? "追加中…" : "この食材を追加する"}
      </button>
    </div>
  );
}

function IngredientEditRow({
  storeId,
  ingredient,
  onSaved,
  onCancel,
}: {
  storeId: string;
  ingredient: IngredientRow;
  onSaved: (i: IngredientRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(ingredient.name);
  const price = usePriceInput(ingredient.currentPurchasePrice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("食材名を入力してください");
      return;
    }
    if (price.resolvedPrice == null || price.resolvedPrice < 0) {
      setError(
        price.priceMode === "calc" ? "仕入れ数量と仕入れ価格を入力してください" : "仕入単価は0以上の数値で入力してください",
      );
      return;
    }
    setSaving(true);
    const result = await updateIngredient({
      storeId,
      ingredientId: ingredient.id,
      name: trimmedName,
      purchasePrice: price.resolvedPrice,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved({ id: ingredient.id, name: trimmedName, unit: ingredient.unit, currentPurchasePrice: price.resolvedPrice });
  }

  return (
    <div className="flex flex-col gap-4 rounded border p-4" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          食材名
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} style={inputStyle} />
        </label>
        <div className="flex w-24 flex-col gap-2 text-base" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          単位
          <div className="rounded border px-4 py-3 text-base" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            {ingredient.unit}
          </div>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        単位はここでは変更できません(既存メニューの分量の意味が変わってしまうため)。単位を変えたい場合は、新しい食材として登録してください。
      </p>

      <PriceInputFields unit={ingredient.unit} price={price} />

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded px-4 py-3 text-base font-bold transition-colors disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          {saving ? "保存中…" : "保存する"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-4 py-3 text-base"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function IngredientsView({
  storeId,
  initialIngredients,
}: {
  storeId: string;
  initialIngredients: IngredientRow[];
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialIngredients);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
    const q = normalize(query.trim());
    const list = q ? ingredients.filter((i) => normalize(i.name).includes(q)) : ingredients;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [ingredients, query]);

  function handleAdded(i: IngredientRow) {
    setIngredients((prev) => [...prev, i]);
    router.refresh();
  }

  function handleSaved(i: IngredientRow) {
    setIngredients((prev) => prev.map((x) => (x.id === i.id ? i : x)));
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <AddIngredientForm storeId={storeId} onAdded={handleAdded} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            登録済みの食材({ingredients.length}件)
          </p>
        </div>

        {ingredients.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="食材名で絞り込む"
            className={INPUT_CLASS}
            style={inputStyle}
          />
        )}

        {ingredients.length === 0 ? (
          <p
            className="rounded border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            まだ食材が登録されていません。上のフォームから追加してください。
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded border border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            「{query}」に一致する食材が見つかりませんでした。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((ing) =>
              editingId === ing.id ? (
                <li key={ing.id}>
                  <IngredientEditRow
                    storeId={storeId}
                    ingredient={ing}
                    onSaved={handleSaved}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li
                  key={ing.id}
                  className="flex items-center justify-between gap-3 rounded border px-4 py-3"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                      {ing.name}
                    </span>
                    <span className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {ing.unit}あたり{formatUnitPrice(ing.currentPurchasePrice)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId(ing.id)}
                    className="shrink-0 rounded border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--muted)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    編集する
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
