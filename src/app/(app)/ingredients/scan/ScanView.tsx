"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeForDedupe } from "@/lib/normalize.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import { scanInvoicePhoto } from "./actions.ts";
import { createIngredient, updateIngredient } from "../actions.ts";
import type { ExtractedInvoiceItem } from "@/lib/invoiceOcr/types.ts";
import { convertUnitPrice, isSameUnit } from "@/lib/invoiceOcr/convertUnitPrice.ts";

export interface ExistingIngredientOption {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
  yieldRatePercent: number;
}

const inputStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
  fontFamily: "var(--font-noto-sans-jp)",
};
const INPUT_CLASS = "w-full rounded border px-3 py-2.5 text-base focus:outline-none focus:ring-2";

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `scan-row-${keySeq}`;
}

interface LocalRow {
  key: string;
  /** "new" = 新しい食材として登録。それ以外は既存食材のID(単価を更新する) */
  target: "new" | string;
  name: string;
  unit: string;
  unitPrice: string;
  /** 納品書に書かれていた単位・単価(登録先を変えたときの再換算に使う) */
  invoiceUnit: string;
  invoicePrice: number | null;
  /** 単位の換算・不一致に関する注意書き */
  unitNote: string | null;
  quantity: number | null;
  lowConfidence: boolean;
  note: string | null;
  included: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function formatPrice(price: number | null): string {
  return price != null ? String(Math.round(price * 100) / 100) : "";
}

/** 既存食材に登録するとき、納品書の単価を登録済みの単位に合わせる */
function resolvePriceForExisting(
  invoiceUnit: string,
  invoicePrice: number | null,
  existingUnit: string,
): { unitPrice: string; unitNote: string | null } {
  if (invoicePrice == null || !invoiceUnit || isSameUnit(invoiceUnit, existingUnit)) {
    return { unitPrice: formatPrice(invoicePrice), unitNote: null };
  }
  const converted = convertUnitPrice(invoicePrice, invoiceUnit, existingUnit);
  if (converted != null) {
    return {
      unitPrice: formatPrice(converted),
      unitNote: `納品書の単位(${invoiceUnit})から登録済みの単位(${existingUnit})に換算しました。納品書の単価: ${formatPrice(invoicePrice)}円/${invoiceUnit}`,
    };
  }
  return {
    unitPrice: formatPrice(invoicePrice),
    unitNote: `納品書の単位は「${invoiceUnit}」、登録済みの単位は「${existingUnit}」で、自動では換算できません。単価が登録済みの単位あたりになっているか確認してください。`,
  };
}

function buildInitialRow(item: ExtractedInvoiceItem, existingByNormalizedName: Map<string, ExistingIngredientOption>): LocalRow {
  const matched = existingByNormalizedName.get(normalizeForDedupe(item.name));
  const invoiceUnit = item.unit ?? "";
  const invoicePrice =
    item.unitPrice ?? (item.totalAmount != null && item.quantity != null && item.quantity > 0 ? item.totalAmount / item.quantity : null);
  const resolved = matched
    ? resolvePriceForExisting(invoiceUnit, invoicePrice, matched.unit)
    : { unitPrice: formatPrice(invoicePrice), unitNote: null };

  return {
    key: nextKey(),
    target: matched ? matched.id : "new",
    name: matched ? matched.name : item.name,
    unit: matched ? matched.unit : invoiceUnit,
    unitPrice: resolved.unitPrice,
    invoiceUnit,
    invoicePrice,
    unitNote: resolved.unitNote,
    quantity: item.quantity,
    lowConfidence: item.lowConfidence,
    note: item.note,
    included: true,
    saving: false,
    saved: false,
    error: null,
  };
}

export function ScanView({
  storeId,
  existingIngredients,
  initialRemaining,
}: {
  storeId: string;
  existingIngredients: ExistingIngredientOption[];
  initialRemaining: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<LocalRow[] | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [savingAll, setSavingAll] = useState(false);

  const existingById = new Map(existingIngredients.map((i) => [i.id, i]));
  const existingByNormalizedName = new Map(existingIngredients.map((i) => [normalizeForDedupe(i.name), i]));

  function handleFileChange(file: File | null) {
    setScanError(null);
    setRows(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleScan() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setScanError("写真を選択してください");
      return;
    }
    setScanning(true);
    setScanError(null);
    setRows(null);
    const formData = new FormData();
    formData.append("photo", file);
    const result = await scanInvoicePhoto(formData);
    setScanning(false);
    if (result.success) setRemaining(result.remaining);
    if (!result.success) {
      setScanError(result.error);
      return;
    }
    setRows(result.items.map((item) => buildInitialRow(item, existingByNormalizedName)));
  }

  function updateRow(key: string, patch: Partial<LocalRow>) {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));
  }

  function handleTargetChange(row: LocalRow, target: string) {
    if (target === "new") {
      updateRow(row.key, { target: "new", unit: row.invoiceUnit, unitPrice: formatPrice(row.invoicePrice), unitNote: null });
      return;
    }
    const existing = existingById.get(target);
    if (!existing) return;
    updateRow(row.key, { target, name: existing.name, unit: existing.unit, ...resolvePriceForExisting(row.invoiceUnit, row.invoicePrice, existing.unit) });
  }

  async function handleSaveRow(row: LocalRow) {
    updateRow(row.key, { saving: true, error: null });
    const price = Number(row.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      updateRow(row.key, { saving: false, error: "単価は0以上の数値で入力してください" });
      return;
    }

    if (row.target === "new") {
      if (!row.name.trim() || !row.unit.trim()) {
        updateRow(row.key, { saving: false, error: "食材名と単位を入力してください" });
        return;
      }
      const result = await createIngredient({ storeId, name: row.name, unit: row.unit, purchasePrice: price, yieldRatePercent: 100 });
      updateRow(row.key, { saving: false, saved: result.success, error: result.success ? null : result.error });
    } else {
      const existing = existingById.get(row.target);
      const result = await updateIngredient({
        storeId,
        ingredientId: row.target,
        name: existing?.name ?? row.name,
        purchasePrice: price,
        yieldRatePercent: existing?.yieldRatePercent ?? 100,
      });
      updateRow(row.key, { saving: false, saved: result.success, error: result.success ? null : result.error });
    }
    router.refresh();
  }

  async function handleSaveAll() {
    if (!rows) return;
    setSavingAll(true);
    // 同時に大量のupsertが走って店舗の食材一意制約に引っかかる事故を避けるため、順番に保存する
    for (const row of rows) {
      if (!row.included || row.saved) continue;
      await handleSaveRow(row);
    }
    setSavingAll(false);
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <label className="flex flex-col gap-2 text-base" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          納品書・請求書の写真
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className={INPUT_CLASS}
            style={inputStyle}
          />
        </label>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="選択した納品書のプレビュー" className="max-h-64 w-auto rounded border object-contain" style={{ borderColor: "var(--border)" }} />
        )}
        {scanError && <ActionErrorMessage error={scanError} />}
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning || remaining <= 0}
          className="self-start rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          {scanning ? "読み取り中…" : "この写真を読み取る"}
        </button>
        <p className="text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          {remaining > 0
            ? `β版期間中の読み取り回数: あと${remaining}回(読み取りに成功したときに数えます)`
            : "β版期間中の読み取り回数の上限に達しました。ご要望があればお知らせください。"}
        </p>
      </div>

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
              読み取り結果({rows.length}件)。内容を確認・修正してから保存してください。
            </p>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={savingAll || rows.every((r) => !r.included || r.saved)}
              className="shrink-0 rounded px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
            >
              {savingAll ? "保存中…" : "選択した品目をまとめて保存"}
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.key} className="flex flex-col gap-3 rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateRow(row.key, { included: e.target.checked })}
                    />
                    保存対象にする
                  </label>
                  {row.lowConfidence && <StatusBadge status="warn" label={row.note ? `要確認: ${row.note}` : "要確認"} />}
                  {row.saved && <StatusBadge status="ok" label="保存済み" />}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground)" }}>
                    登録先
                    <select
                      value={row.target}
                      onChange={(e) => handleTargetChange(row, e.target.value)}
                      disabled={row.saved}
                      className={INPUT_CLASS}
                      style={inputStyle}
                    >
                      <option value="new">新しい食材として登録</option>
                      {existingIngredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}の単価を更新
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground)" }}>
                    食材名
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      disabled={row.target !== "new" || row.saved}
                      className={INPUT_CLASS}
                      style={inputStyle}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground)" }}>
                    単位
                    <input
                      value={row.unit}
                      onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                      disabled={row.target !== "new" || row.saved}
                      placeholder="g"
                      className={INPUT_CLASS}
                      style={inputStyle}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--foreground)" }}>
                    単価(円・1単位あたり)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                      disabled={row.saved}
                      className={INPUT_CLASS + " font-mono"}
                      style={inputStyle}
                    />
                  </label>
                </div>

                {row.unitNote && !row.saved && (
                  <p className="text-sm font-medium" style={{ color: "var(--warning, #b45309)", fontFamily: "var(--font-noto-sans-jp)" }}>
                    ⚠ {row.unitNote}
                  </p>
                )}

                {row.quantity != null && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    納品書に記載の数量: {row.quantity}
                    {row.invoiceUnit || ""}(参考情報。登録内容には反映されません)
                  </p>
                )}

                {row.error && <ActionErrorMessage error={row.error} />}

                {!row.saved && (
                  <button
                    type="button"
                    onClick={() => handleSaveRow(row)}
                    disabled={row.saving}
                    className="self-start rounded border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    {row.saving ? "保存中…" : "この行だけ保存する"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
