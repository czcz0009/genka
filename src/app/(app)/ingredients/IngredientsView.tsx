"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ingredientPriceTaxModeLabel, type IngredientPriceTaxMode } from "@/lib/taxMode.ts";
import { MAX_NAME_LENGTH } from "@/lib/normalize";
import { createIngredient, updateIngredient, deleteIngredient, type IngredientRow } from "./actions.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { Modal } from "@/components/Modal.tsx";

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
// w-full: 配布前QAで発見。入力欄に幅を明示しないと、狭いflexの列(単位・仕入れ価格等)の
// 中でブラウザ既定の内容幅が優先され、スマホ幅(360px)で入力欄が親要素の外にはみ出して
// 見えなくなる/操作できなくなる不具合があったため、常に親の幅いっぱいに広げる。
const INPUT_CLASS = "w-full rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";

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

/** 歩留まり率(%)の入力欄。空欄なら100%(歩留まりなし)。 */
function useYieldRateInput(initialPercent?: number) {
  const [value, setValue] = useState(initialPercent != null && initialPercent < 100 ? String(initialPercent) : "");
  const resolvedPercent = value.trim() ? Number(value) : 100;

  function reset() {
    setValue("");
  }

  return { value, setValue, resolvedPercent, reset };
}

function YieldRateField({ yieldRate }: { yieldRate: ReturnType<typeof useYieldRateInput> }) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex w-32 flex-col gap-2 text-base"
        style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        歩留まり率(%)
        <input
          type="number"
          min={1}
          max={100}
          step="1"
          inputMode="decimal"
          value={yieldRate.value}
          onChange={(e) => yieldRate.setValue(e.target.value)}
          placeholder="例: 70(空欄なら100%)"
          className={INPUT_CLASS + " font-mono"}
          style={inputStyle}
        />
      </label>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        仕入れた量のうち、実際に料理に使える割合です(例: 魚を捌いて骨や皮を除いた後の割合)。分からない・気にしない場合は空欄のままで大丈夫です(100%として扱います)。
      </p>
    </div>
  );
}

function PriceInputFields({
  unit,
  price,
  ingredientPriceTaxMode,
}: {
  unit: string;
  price: ReturnType<typeof usePriceInput>;
  ingredientPriceTaxMode: IngredientPriceTaxMode;
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
              仕入れ価格(円・{ingredientPriceTaxModeLabel(ingredientPriceTaxMode)})
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
          仕入単価(円・{ingredientPriceTaxModeLabel(ingredientPriceTaxMode)})
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

function AddIngredientForm({
  storeId,
  ingredientPriceTaxMode,
  onAdded,
}: {
  storeId: string;
  ingredientPriceTaxMode: IngredientPriceTaxMode;
  onAdded: (i: IngredientRow) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const price = usePriceInput();
  const yieldRate = useYieldRateInput();
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
    if (!Number.isFinite(yieldRate.resolvedPercent) || yieldRate.resolvedPercent <= 0 || yieldRate.resolvedPercent > 100) {
      setError("歩留まり率は0より大きく100以下の数値で入力してください");
      return;
    }
    setSaving(true);
    const result = await createIngredient({
      storeId,
      name: trimmedName,
      unit: unit.trim(),
      purchasePrice: price.resolvedPrice,
      yieldRatePercent: yieldRate.resolvedPercent,
    });
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
    yieldRate.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          食材名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 豚肉"
            maxLength={MAX_NAME_LENGTH}
            className={INPUT_CLASS}
            style={inputStyle}
          />
        </label>
        <label className="flex w-24 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          単位
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g" className={INPUT_CLASS} style={inputStyle} />
        </label>
      </div>

      <PriceInputFields unit={unit} price={price} ingredientPriceTaxMode={ingredientPriceTaxMode} />
      <YieldRateField yieldRate={yieldRate} />

      {error && <ActionErrorMessage error={error} />}
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
  ingredientPriceTaxMode,
  onSaved,
  onCancel,
}: {
  storeId: string;
  ingredient: IngredientRow;
  ingredientPriceTaxMode: IngredientPriceTaxMode;
  onSaved: (i: IngredientRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(ingredient.name);
  const price = usePriceInput(ingredient.currentPurchasePrice);
  const yieldRate = useYieldRateInput(ingredient.yieldRatePercent);
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
    if (!Number.isFinite(yieldRate.resolvedPercent) || yieldRate.resolvedPercent <= 0 || yieldRate.resolvedPercent > 100) {
      setError("歩留まり率は0より大きく100以下の数値で入力してください");
      return;
    }
    setSaving(true);
    const result = await updateIngredient({
      storeId,
      ingredientId: ingredient.id,
      name: trimmedName,
      purchasePrice: price.resolvedPrice,
      yieldRatePercent: yieldRate.resolvedPercent,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved({
      id: ingredient.id,
      name: trimmedName,
      unit: ingredient.unit,
      currentPurchasePrice: price.resolvedPrice,
      yieldRatePercent: yieldRate.resolvedPercent,
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded border p-4" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          食材名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            className={INPUT_CLASS}
            style={inputStyle}
          />
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

      <PriceInputFields unit={ingredient.unit} price={price} ingredientPriceTaxMode={ingredientPriceTaxMode} />
      <YieldRateField yieldRate={yieldRate} />

      {error && <ActionErrorMessage error={error} />}

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
  ingredientPriceTaxMode,
}: {
  storeId: string;
  initialIngredients: IngredientRow[];
  ingredientPriceTaxMode: IngredientPriceTaxMode;
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialIngredients);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 食材ごとの削除失敗メッセージ(「使用中のメニューがあるため削除できません」等)。
  // 一覧全体で1つの共有エラーにすると、どの食材の削除が失敗したのか分かりにくいため、
  // 食材IDごとに保持してその行の直下に表示する。
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

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

  /**
   * 食材の削除(取り消せない操作)。
   * 確認ダイアログ→サーバーアクション呼び出し、の順で行う。
   * サーバー側で「使用中のメニューがあれば削除を拒否する」チェックが入っているため、
   * 失敗時のエラーメッセージ(例:「〇〇で使われているため削除できません」)を
   * そのまま該当行の下に表示する。
   */
  async function handleDelete(ing: IngredientRow) {
    if (!window.confirm(`「${ing.name}」を削除します。この操作は取り消せません。よろしいですか?`)) return;
    setDeletingId(ing.id);
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[ing.id];
      return next;
    });
    const result = await deleteIngredient({ storeId, ingredientId: ing.id });
    setDeletingId(null);
    if (!result.success) {
      setDeleteErrors((prev) => ({ ...prev, [ing.id]: result.error }));
      return;
    }
    setIngredients((prev) => prev.filter((x) => x.id !== ing.id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            登録済みの食材({ingredients.length}件)
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="shrink-0 rounded px-4 py-2.5 text-sm font-bold transition-colors"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            ＋ 食材を追加
          </button>
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
            まだ食材が登録されていません。上の「＋ 食材を追加」ボタンから追加してください。
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
                    ingredientPriceTaxMode={ingredientPriceTaxMode}
                    onSaved={handleSaved}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li
                  key={ing.id}
                  className="flex flex-col gap-2 rounded border px-4 py-3"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="break-words text-base font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                        {ing.name}
                      </span>
                      <span className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>
                        {ing.unit}あたり{formatUnitPrice(ing.currentPurchasePrice)}
                        {ing.yieldRatePercent < 100 && `(歩留まり${ing.yieldRatePercent}%)`}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(ing.id)}
                        className="rounded border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--muted)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                      >
                        編集する
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ing)}
                        disabled={deletingId === ing.id}
                        className="rounded border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--muted)] disabled:opacity-40"
                        style={{ borderColor: "var(--border)", color: "var(--status-danger)" }}
                      >
                        {deletingId === ing.id ? "削除中…" : "削除する"}
                      </button>
                    </div>
                  </div>
                  {deleteErrors[ing.id] && <ActionErrorMessage error={deleteErrors[ing.id]} />}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {showAddModal && (
        <Modal title="食材を追加" onClose={() => setShowAddModal(false)}>
          <AddIngredientForm storeId={storeId} ingredientPriceTaxMode={ingredientPriceTaxMode} onAdded={handleAdded} />
        </Modal>
      )}
    </div>
  );
}
