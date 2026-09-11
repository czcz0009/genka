"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calcCostRate } from "@/lib/costCalc";
import { normalizeForDedupe } from "@/lib/normalize.ts";
import { saveMenuWithIngredients, type SaveMenuLineInput } from "./actions.ts";

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
  /**
   * true = このメニュー編集セッション中に「新規食材」として追加した、
   * まだサーバーに保存されていない食材(idはこの画面内だけで使う仮のもの)。
   * 保存前に同じ食材名をもう一度使いたい時、候補として出すためだけに使う。
   * この食材を選んでも、実際の保存時には常に「新規食材」として扱う
   * (サーバー側で名前が重複していれば自動的に1つの食材にまとめられる)。
   */
  isLocalDraft?: boolean;
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

/**
 * 「1kgで800円」のようなパック単位の仕入れ情報から、レシピで使う単位
 * (g/ml/個など)1つあたりの単価を計算する。数量が0以下、または数値でない
 * 場合はnull(まだ計算できない)を返す。
 */
function computeUnitPriceFromPackage(purchaseQuantity: number, purchasePrice: number): number | null {
  if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) return null;
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return null;
  return purchasePrice / purchaseQuantity;
}

/** 食材名の絞り込み検索用(全角/半角・大文字小文字のゆれを吸収する) */
function normalizeQuery(s: string): string {
  return s.normalize("NFKC").toLowerCase();
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
      className="flex-1 rounded border px-3 py-2.5 transition-colors"
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
  // このメニュー編集中に「新規食材」として追加した食材の下書き一覧。
  // 保存前でも、次に同じ食材名を使いたい時に候補として出せるようにするため保持する
  // (「新規食材の追加が食材リストに反映されない」という指摘の対応)。
  const [localNewIngredients, setLocalNewIngredients] = useState<IngredientOption[]>([]);

  const combinedIngredients = useMemo(
    () => [...allIngredients, ...localNewIngredients],
    [allIngredients, localNewIngredients],
  );

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * l.unitPrice, 0),
    [lines],
  );
  const sellingPriceNumber = sellingPrice.trim() ? Number(sellingPrice) : null;
  const costRate = calcCostRate(totalCost, sellingPriceNumber);
  const overTarget = costRate != null && costRate > targetCostRate;

  function addLine(line: LocalLine) {
    setLines((prev) => [...prev, line]);
    if (line.source.type === "new") {
      const key = normalizeForDedupe(line.ingredientName);
      setLocalNewIngredients((prev) => {
        const alreadyKnown =
          allIngredients.some((i) => normalizeForDedupe(i.name) === key) ||
          prev.some((i) => normalizeForDedupe(i.name) === key);
        if (alreadyKnown) return prev;
        return [
          ...prev,
          { id: `draft-${line.key}`, name: line.ingredientName, unit: line.unit, currentPurchasePrice: line.unitPrice, isLocalDraft: true },
        ];
      });
    }
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
      <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        メニュー名
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 生姜焼き定食"
          className={INPUT_CLASS}
          style={inputStyle}
        />
      </label>

      <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        売価(円)
        <input
          type="number"
          min={0}
          step="1"
          inputMode="decimal"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          placeholder="例: 900(あとで入力してもOK)"
          className={INPUT_CLASS + " font-mono"}
          style={inputStyle}
        />
      </label>

      {/* 現在の原価率 */}
      <div className="flex items-center gap-6 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            原価率
          </div>
          <div
            className="mt-1 font-mono text-3xl font-bold leading-none"
            style={{ color: overTarget ? "var(--status-danger)" : costRate != null ? "var(--status-ok)" : "var(--muted-foreground)" }}
          >
            {costRate != null ? `${costRate.toFixed(1)}%` : "-"}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            目標{targetCostRate}%
          </div>
        </div>
        <div className="h-12 w-px" style={{ background: "var(--border)" }} />
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            原価合計
          </div>
          <div className="mt-1 font-mono text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            {formatYen(totalCost)}
          </div>
        </div>
      </div>

      <IngredientLineForm
        allIngredients={combinedIngredients}
        existingNames={new Set(lines.map((l) => l.ingredientName))}
        onAdd={addLine}
      />

      {/*
        追加済みの食材一覧。以前は食材名+分量のみで、いくら原価に効いているかが
        分からず「確認しづらい」との指摘を受けたため、単価と小計(円)を明示する。
        1件も無い時は空リストを黙って隠すのではなく、次に何をすればいいか案内する。
        「食材を追加」フォームのすぐ下に置き、追加した結果がその場で確認できるようにする。
      */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          追加した食材{lines.length > 0 ? `(${lines.length}件)` : ""}
        </p>
        {lines.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => {
              const qty = Number(l.quantity) || 0;
              const subtotal = qty * l.unitPrice;
              return (
                <li
                  key={l.key}
                  className="flex items-center justify-between gap-3 rounded border px-4 py-3"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                      {l.ingredientName}
                    </span>
                    <span className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {qty}
                      {l.unit} × {formatUnitPrice(l.unitPrice)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-base font-semibold" style={{ color: "var(--foreground)" }}>
                      {formatYen(subtotal)}
                    </span>
                    <button
                      onClick={() => removeLine(l.key)}
                      className="shrink-0 rounded px-3 py-2 text-sm underline underline-offset-2 transition-colors hover:bg-[color:var(--muted)]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            className="rounded border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            まだ食材が追加されていません。上のフォームから追加してください。
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => handleSave("save")}
          disabled={saving != null}
          className="flex-1 rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          {saving === "save" ? "保存中…" : "保存する"}
        </button>
        <button
          onClick={() => handleSave("saveAndNew")}
          disabled={saving != null}
          className="flex-1 rounded border px-5 py-4 text-base font-medium disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
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
 *
 * 食材名は自由入力のテキストボックス1本にまとめている。入力中、登録済みの
 * 食材名と部分一致するものがあればすぐ下に候補を出し、クリックすればその
 * 食材を使う(既存食材)。候補を選ばずそのまま追加すると、一致する登録済み
 * 食材が無ければ新しい食材として登録される。「既存か新規か」を事前に
 * ユーザーが意識して切り替える必要がないようにするための設計。
 * また、分量の入力欄は食材名の入力欄のすぐ横に並べて置き、
 * 「食材を選ぶ」と「量を決める」が離れて分かりにくいという指摘に対応している。
 *
 * 食材名の欄はテキストボックスとプルダウンのハイブリッド: カーソルを
 * 合わせた(フォーカスした)時点で登録済み食材の一覧を候補として出し、
 * 文字を打つと絞り込まれる。候補をクリックした時にblurが先に発火して
 * リストが消え、クリックが成立しなくなる問題を避けるため、blur時は
 * 少し待ってから候補を隠すようにしている。
 */
function IngredientLineForm({
  allIngredients,
  existingNames,
  onAdd,
}: {
  allIngredients: IngredientOption[];
  existingNames: Set<string>;
  onAdd: (line: LocalLine) => void;
}) {
  const [nameInput, setNameInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState("g");
  // 仕入単価の入力方法: "calc" = パック等の仕入れ数量・仕入れ価格から自動計算(既定)、
  // "direct" = 単位1つあたりの金額をすでに知っている場合に直接入力。
  const [priceMode, setPriceMode] = useState<"calc" | "direct">("calc");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchasePriceTotal, setPurchasePriceTotal] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 「本当に追加されたのか分かりづらい」という指摘への対応。追加が成功したら
  // 一定時間ここにメッセージを出す(操作のたびに消える一時的なフィードバック)。
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // 食材名欄にカーソルがある(フォーカスしている)かどうか。
  // ここがtrueの間はプルダウン(候補一覧)を表示する。
  const [isNameFocused, setIsNameFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(null), 2500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  // blur用のタイマーはアンマウント時に必ず片付ける
  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  const trimmedName = nameInput.trim();

  const selectedById = selectedId ? (allIngredients.find((i) => i.id === selectedId) ?? null) : null;
  // 候補をクリックしていなくても、入力した名前が登録済みの食材名と(表記ゆれを
  // 吸収した上で)完全に一致するなら、自動的に既存食材として扱う。
  // 「既存か新規かを事前に意識しなくても自然に正しい方に振り分けられる」ための鍵。
  const exactMatch =
    !selectedById && trimmedName
      ? (allIngredients.find((i) => normalizeForDedupe(i.name) === normalizeForDedupe(trimmedName)) ?? null)
      : null;
  const effectiveExisting = selectedById ?? exactMatch;

  // 食材名にカーソルを合わせた時点(まだ何も入力していない状態)では全件、
  // 文字を入力し始めたら部分一致するものだけに絞り込む(テキストボックスと
  // プルダウンのハイブリッド)。
  const suggestions = useMemo(() => {
    if (effectiveExisting) return [];
    if (!trimmedName) return allIngredients;
    const q = normalizeQuery(trimmedName);
    return allIngredients.filter((i) => normalizeQuery(i.name).includes(q));
  }, [trimmedName, effectiveExisting, allIngredients]);

  // フォーカスが外れたら候補を隠す。ただし候補をクリックした瞬間は
  // 「クリックによるblur」→「候補のonClick」の順でイベントが起きるため、
  // ここで即座に隠すとクリックが成立しなくなる。少し待ってから隠すことで、
  // クリック処理(handleSelectSuggestion)が先に完了できるようにしている。
  const showDropdown = isNameFocused && !effectiveExisting && suggestions.length > 0;

  const effectiveUnit = effectiveExisting ? effectiveExisting.unit : newUnit;
  const computedUnitPrice = computeUnitPriceFromPackage(Number(purchaseQuantity), Number(purchasePriceTotal));

  function handleNameChange(value: string) {
    setNameInput(value);
    // 入力し直したら選択状態は一旦解除する(上のexactMatch判定で再度自動判定される)
    setSelectedId(null);
    setError(null);
  }

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

  function handleSelectSuggestion(i: IngredientOption) {
    setSelectedId(i.id);
    setNameInput(i.name);
    setError(null);
    setIsNameFocused(false);
    // 食材を選んだら、そのまま続けて分量を入力できるようにフォーカスを移す
    quantityInputRef.current?.focus();
  }

  function clearSelection() {
    setSelectedId(null);
    setNameInput("");
    nameInputRef.current?.focus();
  }

  function handleAdd() {
    setError(null);
    if (!trimmedName) {
      setError("食材名を入力してください");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("分量は0より大きい数値で入力してください");
      return;
    }

    if (effectiveExisting) {
      // 「新規食材」として追加した下書きの候補を選んだ場合、実体はまだサーバーに
      // 保存されていないため、送信時は常に newIngredient として扱う
      // (サーバー側で同じ名前の食材は自動的に1つにまとめられるので重複はしない)。
      onAdd({
        key: nextKey(),
        quantity,
        unit: effectiveExisting.unit,
        ingredientName: effectiveExisting.name,
        unitPrice: effectiveExisting.currentPurchasePrice,
        source: effectiveExisting.isLocalDraft
          ? { type: "new", name: effectiveExisting.name, unit: effectiveExisting.unit, purchasePrice: effectiveExisting.currentPurchasePrice }
          : { type: "existing", ingredientId: effectiveExisting.id },
      });
      setJustAdded(`${effectiveExisting.name} ${quantity}${effectiveExisting.unit}`);
    } else {
      if (!newUnit.trim()) {
        setError("単位を入力してください");
        return;
      }
      const price = priceMode === "calc" ? computedUnitPrice : Number(newPrice);
      if (price == null || !Number.isFinite(price) || price < 0) {
        setError(
          priceMode === "calc"
            ? "仕入れ数量と仕入れ価格を入力してください"
            : "仕入単価は0以上の数値で入力してください",
        );
        return;
      }
      onAdd({
        key: nextKey(),
        quantity,
        unit: newUnit,
        ingredientName: trimmedName,
        unitPrice: price,
        source: { type: "new", name: trimmedName, unit: newUnit, purchasePrice: price },
      });
      setJustAdded(`${trimmedName} ${quantity}${newUnit}(新規食材として登録)`);
    }

    // フォームをリセットして、続けて次の食材をすぐ追加できるようにする
    setNameInput("");
    setSelectedId(null);
    setQuantity("");
    setNewPrice("");
    setPurchaseQuantity("");
    setPurchasePriceTotal("");
  }

  return (
    <div className="flex flex-col gap-5 rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <p className="text-base font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
        食材を追加
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <label
            className="flex flex-1 flex-col gap-2 text-base"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            食材名
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={handleNameFocus}
              onBlur={handleNameBlur}
              placeholder="例: 豚肉(クリックすると候補が出ます)"
              className={INPUT_CLASS}
              style={inputStyle}
            />
          </label>
          <label
            className="flex w-24 flex-col gap-2 text-base"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            分量({effectiveUnit || "g"})
            <input
              ref={quantityInputRef}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="例: 150"
              className={INPUT_CLASS + " font-mono"}
              style={inputStyle}
            />
          </label>
        </div>

        {effectiveExisting ? (
          <div
            className="flex items-center justify-between gap-3 rounded border px-4 py-3 text-sm"
            style={{ borderColor: "var(--status-ok)", background: "var(--card)" }}
          >
            <span style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              ✓ 登録済みの「{effectiveExisting.name}」を使います({effectiveExisting.unit}あたり
              {formatUnitPrice(effectiveExisting.currentPurchasePrice)})
              {existingNames.has(effectiveExisting.name) && (
                <span className="ml-2" style={{ color: "var(--muted-foreground)" }}>
                  (このメニューに追加済み)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 rounded px-3 py-2 text-sm underline underline-offset-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              変更する
            </button>
          </div>
        ) : (
          showDropdown && (
            <div className="max-h-48 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
              {suggestions.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(i)}
                  className="flex w-full items-center justify-between border-b px-4 py-3 text-left text-base transition-colors last:border-0 hover:bg-[color:var(--muted)]"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  <span style={{ fontFamily: "var(--font-noto-sans-jp)" }}>
                    {i.name}
                    {existingNames.has(i.name) && (
                      <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        (追加済み)
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {i.unit}あたり{formatUnitPrice(i.currentPurchasePrice)}
                  </span>
                </button>
              ))}
            </div>
          )
        )}

        {!effectiveExisting && trimmedName && suggestions.length === 0 && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            一致する登録済み食材が見つからないため、「{trimmedName}」を新しい食材として登録します。
          </p>
        )}
      </div>

      {!effectiveExisting && trimmedName && (
        <div className="flex flex-col gap-4 rounded p-4" style={{ background: "var(--muted)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
            新しい食材として登録します
          </p>
          <label
            className="flex w-28 flex-col gap-2 text-base"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            単位
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="g"
              className={INPUT_CLASS}
              style={inputStyle}
            />
          </label>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            レシピでこの食材を使う時の単位です(上の「分量」の単位もこれに合わせて変わります)。
          </p>

          <div className="flex gap-2 text-sm">
            <TabButton active={priceMode === "calc"} onClick={() => setPriceMode("calc")}>
              仕入れ価格から計算する
            </TabButton>
            <TabButton active={priceMode === "direct"} onClick={() => setPriceMode("direct")}>
              単価を直接入力する
            </TabButton>
          </div>

          {priceMode === "calc" ? (
            <>
              <div className="flex gap-3">
                <label
                  className="flex flex-1 flex-col gap-2 text-base"
                  style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
                >
                  仕入れ数量({newUnit.trim() || "単位"})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={purchaseQuantity}
                    onChange={(e) => setPurchaseQuantity(e.target.value)}
                    placeholder="例: 1000"
                    className={INPUT_CLASS + " font-mono"}
                    style={inputStyle}
                  />
                </label>
                <label
                  className="flex flex-1 flex-col gap-2 text-base"
                  style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
                >
                  仕入れ価格(円)
                  <input
                    type="number"
                    min={0}
                    step="1"
                    inputMode="decimal"
                    value={purchasePriceTotal}
                    onChange={(e) => setPurchasePriceTotal(e.target.value)}
                    placeholder="例: 800"
                    className={INPUT_CLASS + " font-mono"}
                    style={inputStyle}
                  />
                </label>
              </div>
              <div
                className="rounded px-4 py-3 text-sm"
                style={{ background: "var(--card)", color: computedUnitPrice != null ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {computedUnitPrice != null
                  ? `→ ${newUnit.trim() || "単位"}1つあたり ${formatUnitPrice(computedUnitPrice)}`
                  : "仕入れ数量と仕入れ価格を入力すると、単価を自動で計算します"}
              </div>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                例:1kg(=1000g)を800円で仕入れた場合、単位を「g」、仕入れ数量を「1000」、仕入れ価格を「800」と入力してください。
              </p>
            </>
          ) : (
            <>
              <label
                className="flex flex-col gap-2 text-base"
                style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
              >
                仕入単価(円)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="例: 0.7"
                  className={INPUT_CLASS + " font-mono"}
                  style={inputStyle}
                />
              </label>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                「単位1つあたりの金額」を直接入力します。
              </p>
            </>
          )}
        </div>
      )}

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
        className="rounded px-5 py-4 text-base font-bold transition-colors"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        この食材をメニューに追加する
      </button>
    </div>
  );
}
