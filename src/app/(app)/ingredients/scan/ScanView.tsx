"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeForDedupe } from "@/lib/normalize.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import { recordInvoiceScan, rememberAliases, rememberConversions, scanInvoicePhoto } from "./actions.ts";
import { createIngredient, updateIngredient } from "../actions.ts";
import type { ExtractedInvoiceItem, InvoiceMeta, InvoicePage } from "@/lib/invoiceOcr/types.ts";
import { isSameUnit } from "@/lib/invoiceOcr/convertUnitPrice.ts";
import { prepareUpload, resizeInBrowser, runScan } from "@/lib/invoiceOcr/uploadPrep.ts";
import { computeRowPrice, validateConversionInput, type InvoiceTaxBasis } from "@/lib/invoiceOcr/unitPrice.ts";
import { confirmBlockers, reviewReasonLabel, reviewReasons, type ReviewReason } from "@/lib/invoiceOcr/reviewRows.ts";
import {
  confirmEstimate,
  conversionFromState,
  conversionToSave,
  editConversionValue,
  initialConversionState,
  isUnconfirmedEstimate,
  type ConversionRowToSave,
  type ConversionState,
} from "@/lib/invoiceOcr/conversionMemory.ts";
import { duplicateNotice, findPossibleDuplicate, type InvoiceRecord } from "@/lib/invoiceOcr/duplicateInvoice.ts";
import { affectedMenus, type AffectedMenu } from "@/lib/invoiceOcr/affectedMenus.ts";
import { aliasToSave, matchIngredient, type AliasRowToSave } from "@/lib/invoiceOcr/nameMatching.ts";
import { checkUploadSet, MAX_PHOTOS, type InvoiceFileKind } from "@/lib/invoiceOcr/uploadSet.ts";
import { MULTI_PAGE_HINT, pagesMismatchNotice } from "@/lib/invoiceOcr/pageConsistency.ts";
import { ingredientPriceTaxModeLabel, type IngredientPriceTaxMode } from "@/lib/taxMode.ts";

/**
 * 納品書の読み取り → 確認 → まとめて確定(設計の2・3段目、2026-10-28。docs/design-invoice-flow.md)。
 * 計算と決まりは src/lib/invoiceOcr/ にあり、テストで確かめている(unitPrice・reviewRows・conversionMemory・duplicateInvoice)。
 * - 読み取った直後に「要確認」と「いつもどおり」に分ける(直している途中で行が移動しないよう、分け方は最初に決める)
 * - すべての欄をその場で直せる。税込・税抜は納品書1枚につき1回選ぶ(AIが判定できなかったときだけ必須)
 * - 換算(1個 = 何g)は、覚えた値 → 目安 → 空欄 の順で最初の値を入れる。目安は店主が確かめるまで確定できない
 * - 4・5段目(2026-10-28): 登録先は 名前の一致 → 覚えた対応 で自動、似た名前・同義語は候補のボタンだけ(nameMatching.ts)。
 *   写真は5枚まで・PDFは1つ5ページまで(同じ納品書の続きのページ。uploadSet.ts)。ページごとの日付・仕入れ先が違えば知らせる
 */

export interface ExistingIngredientOption {
  id: string;
  name: string;
  unit: string;
  currentPurchasePrice: number;
  priceIsSet: boolean;
  yieldRatePercent: number;
}

/** 完了画面「原価率が変わったメニュー」の計算に使うデータ(affectedMenus.ts) */
export type CostData = Omit<Parameters<typeof affectedMenus>[0], "updates">;

export interface NameAlias {
  ingredientId: string;
  normalizedAlias: string;
}

export interface RememberedConversion {
  ingredientId: string;
  purchaseUnit: string;
  amount: number;
  unit: string;
}

const inputStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
  fontFamily: "var(--font-noto-sans-jp)",
};
const INPUT_CLASS = "w-full min-w-0 rounded border px-3 py-2.5 text-base focus:outline-none focus:ring-2 disabled:opacity-60";
const LABEL_CLASS = "flex min-w-0 flex-col gap-1 text-sm";
const JP: React.CSSProperties = { fontFamily: "var(--font-noto-sans-jp)" };

/** 新しい食材の単位の候補(自由に入力もできる) */
const UNIT_OPTIONS = ["g", "kg", "ml", "L", "個", "本", "玉", "袋", "パック", "束", "枚", "切れ", "缶", "箱", "株"];

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `scan-row-${keySeq}`;
}

interface Row {
  key: string;
  /** この行を確定するか */
  included: boolean;
  /** "new" = 新しい食材として登録。それ以外は登録済みの食材のID(単価を更新) */
  target: "new" | string;
  /** 登録先の検索の文字 */
  search: string;
  /** 新しい食材として登録するときの名前・単位 */
  newName: string;
  newUnit: string;
  /** 納品書の表記(画面の見出しに出す) */
  invoiceName: string;
  /** 納品書の数量・単位・単価(直せる)。単価が空欄なら 金額÷数量 で計算する */
  quantity: string;
  invoiceUnit: string;
  unitPrice: string;
  totalAmount: number | null;
  taxRate: 8 | 10;
  conversion: ConversionState | null;
  lowConfidence: boolean;
  note: string | null;
  /** 読み取った直後に決めた分け方(要確認なら true) */
  needsReview: boolean;
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
  /** 確定した後の食材ID(新しく登録した食材の換算を覚えるため) */
  savedIngredientId: string | null;
  /** 自動で選んだ登録先(名前・覚えた対応で一致)。無ければ null */
  autoMatchedId: string | null;
  /** 候補(似た名前・同義語の辞書。自動では選ばない) */
  candidateIds: string[];
  /** 「この名前を覚える」の印(店主が登録先を選び直したときに出す) */
  rememberName: boolean;
}

/** 選んだファイル(写真は縮小前のまま持ち、送る直前に縮小する) */
interface PickedFile {
  key: string;
  file: File;
  kind: "image" | "pdf";
  previewUrl: string | null;
}

function numOrNull(s: string): number | null {
  const t = s.normalize("NFKC").replace(/[,¥\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}円`;
}

export function ScanView({
  storeId,
  storeTaxMode,
  existingIngredients,
  rememberedConversions,
  invoiceRecords,
  costData,
  nameAliases,
  initialRemaining,
}: {
  storeId: string;
  storeTaxMode: IngredientPriceTaxMode;
  existingIngredients: ExistingIngredientOption[];
  rememberedConversions: RememberedConversion[];
  invoiceRecords: InvoiceRecord[];
  costData: CostData | null;
  nameAliases: NameAlias[];
  initialRemaining: number;
}) {
  const router = useRouter();
  // 入口は2つ(2026-10-27、設計の1段目): カメラを直接開く「写真を撮る」と、ライブラリやファイルから選ぶ「写真・ファイルから選ぶ」
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const pickInputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [pages, setPages] = useState<InvoicePage[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [invoice, setInvoice] = useState<InvoiceMeta | null>(null);
  /** 納品書の金額が税込か税抜か(AIの判定。判定できなければ店主が選ぶ) */
  const [taxBasis, setTaxBasis] = useState<InvoiceTaxBasis | null>(null);
  const [taxBasisFromAi, setTaxBasisFromAi] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [confirming, setConfirming] = useState(false);
  const [showBlockers, setShowBlockers] = useState(false);
  const [done, setDone] = useState<{
    updated: number;
    created: number;
    remembered: number;
    namesRemembered: number;
    failed: number;
    conversionError: string | null;
    menus: AffectedMenu[];
  } | null>(null);

  const existingById = new Map(existingIngredients.map((i) => [i.id, i]));

  function rememberedFor(ingredientId: string, purchaseUnit: string) {
    const hit = rememberedConversions.find((c) => c.ingredientId === ingredientId && isSameUnit(c.purchaseUnit, purchaseUnit));
    return hit ? { amount: hit.amount, unit: hit.unit } : null;
  }

  function ingredientUnitOf(row: Pick<Row, "target" | "newUnit">): string {
    return row.target === "new" ? row.newUnit : (existingById.get(row.target)?.unit ?? "");
  }

  /** 登録先・単位が変わったときに、換算の欄を作り直す */
  function freshConversion(row: Pick<Row, "target" | "newUnit" | "newName" | "invoiceUnit">): ConversionState | null {
    const existing = row.target === "new" ? null : existingById.get(row.target);
    return initialConversionState({
      ingredientName: existing ? existing.name : row.newName,
      purchaseUnit: row.invoiceUnit,
      ingredientUnit: ingredientUnitOf(row),
      remembered: existing ? rememberedFor(existing.id, row.invoiceUnit) : null,
    });
  }

  /** 1行の計算(単価・要確認の理由)。表示のたびに計算する */
  function derive(row: Row, basis: InvoiceTaxBasis | null) {
    const ingredientUnit = ingredientUnitOf(row);
    const existing = row.target === "new" ? null : existingById.get(row.target);
    const conv = conversionFromState(row.conversion);
    const calc = computeRowPrice({
      quantity: numOrNull(row.quantity),
      unitPrice: numOrNull(row.unitPrice),
      totalAmount: row.totalAmount,
      invoiceUnit: row.invoiceUnit,
      invoiceTaxBasis: basis,
      storeTaxMode,
      taxRatePercent: row.taxRate,
      ingredientUnit,
      conversion: conv,
    });
    const needsConversion = row.conversion != null && conv == null;
    const unconfirmedEstimate = isUnconfirmedEstimate(row.conversion);
    const previousPrice = existing && existing.priceIsSet ? existing.currentPurchasePrice : null;
    const reasons = reviewReasons({
      isNew: row.target === "new",
      needsConversion: needsConversion || unconfirmedEstimate,
      lowConfidence: row.lowConfidence,
      amountMismatch: calc.amountMismatch,
      computedFromAmount: calc.computedFromAmount,
      previousPrice,
      newPrice: calc.price,
    });
    return {
      ingredientUnit,
      existing,
      calc,
      needsConversion,
      unconfirmedEstimate,
      previousPrice,
      reasons,
      conversionError: row.conversion && row.conversion.value.trim() !== "" ? validateConversionInput(row.conversion.value) : null,
    };
  }

  function buildRow(item: ExtractedInvoiceItem, basis: InvoiceTaxBasis | null): Row {
    const match = matchIngredient(item.name, existingIngredients, nameAliases);
    const autoMatchedId = match.kind === "name" || match.kind === "alias" ? match.ingredientId : null;
    const invoiceUnit = item.unit ?? "";
    const base = {
      target: autoMatchedId ?? ("new" as const),
      newName: item.name,
      newUnit: invoiceUnit,
      invoiceUnit,
    };
    const row: Row = {
      key: nextKey(),
      included: true,
      search: "",
      ...base,
      invoiceName: item.name,
      quantity: item.quantity != null ? String(item.quantity) : "",
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
      totalAmount: item.totalAmount,
      taxRate: item.taxRate ?? 8,
      conversion: null,
      lowConfidence: item.lowConfidence,
      note: item.note,
      needsReview: false,
      status: "idle",
      error: null,
      savedIngredientId: null,
      autoMatchedId,
      candidateIds: match.kind === "candidates" ? match.ingredientIds : [],
      rememberName: true,
    };
    row.conversion = freshConversion(row);
    row.needsReview = derive(row, basis).reasons.length > 0;
    return row;
  }

  /** 選んだ写真・PDFを足す(写真を撮る・選ぶを何回かに分けてもよい。5枚まで) */
  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setScanError(null);
    setRows(null);
    setDone(null);
    const added: PickedFile[] = Array.from(list).map((file) => {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      return { key: nextKey(), file, kind: isPdf ? "pdf" : "image", previewUrl: isPdf ? null : URL.createObjectURL(file) };
    });
    setPicked((prev) => [...prev, ...added]);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (pickInputRef.current) pickInputRef.current.value = "";
  }

  function removeFile(key: string) {
    setPicked((prev) => {
      const hit = prev.find((p) => p.key === key);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  /** 選んだものを消して、もう一度選べる状態に戻す(送れなかった・断られたとき) */
  function resetPhoto() {
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (pickInputRef.current) pickInputRef.current.value = "";
    picked.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPicked([]);
  }

  // 写真はブラウザの中で1枚ずつ縮小してから送る(スマホの写真が大きすぎて送れなかった不具合の対策。uploadPrep.ts)。PDFはそのまま送る。
  // 送れなかった・断られた・時間がかかりすぎたときも、必ず日本語のエラーを出して、選び直せる状態に戻す。
  async function handleScan() {
    if (picked.length === 0) {
      setScanError("写真かPDFを選択してください");
      return;
    }
    setScanning(true);
    setScanError(null);
    setRows(null);
    setDone(null);
    setShowBlockers(false);
    try {
      const formData = new FormData();
      const sizes: { kind: InvoiceFileKind; size: number }[] = [];
      for (const p of picked) {
        if (p.kind === "pdf") {
          formData.append("files", p.file);
          sizes.push({ kind: "pdf", size: p.file.size });
          continue;
        }
        let resized: Blob | null = null;
        const prepared = await prepareUpload(p.file, async () => (resized = await resizeInBrowser(p.file)));
        if (!prepared.ok) {
          setScanError(prepared.error);
          return;
        }
        const blob: Blob = prepared.kind === "resized" && resized ? resized : p.file;
        formData.append("files", blob, prepared.kind === "resized" ? "photo.jpg" : p.file.name);
        sizes.push({ kind: "jpeg", size: blob.size });
      }
      // 送る前に、組み合わせ(5枚まで・PDFと写真を混ぜない・合計3.5MBまで)を確かめる。サーバーでも同じように確かめる
      const setError = checkUploadSet(sizes);
      if (setError) {
        setScanError(setError);
        return;
      }
      const result = await runScan(() => scanInvoicePhoto(formData));
      if (!result.success) {
        setScanError(result.error);
        resetPhoto();
        return;
      }
      setRemaining(result.remaining);
      setInvoice(result.invoice);
      setPages(result.pages);
      setTaxBasis(result.invoice.taxBasis);
      setTaxBasisFromAi(result.invoice.taxBasis != null);
      setRows(result.items.map((item) => buildRow(item, result.invoice.taxBasis ?? storeTaxMode)));
    } finally {
      setScanning(false);
    }
  }

  function updateRow(key: string, patch: Partial<Row> | ((r: Row) => Partial<Row>)) {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)) : prev));
  }

  /** 登録先・単位(納品書・新しい食材)が変わったら、換算を作り直す */
  function updateRowAndConversion(key: string, patch: Partial<Row>) {
    updateRow(key, (r) => {
      const next = { ...r, ...patch };
      return { ...patch, conversion: freshConversion(next) };
    });
  }

  const rowViews = (rows ?? []).map((row) => ({ row, d: derive(row, taxBasis) }));
  const pending = rowViews.filter((v) => v.row.included && v.row.status !== "saved");
  const blockers = confirmBlockers({
    needsTaxChoice: rows != null && taxBasis == null,
    rows: pending.map(({ row, d }) => ({
      name: row.target === "new" ? row.newName || row.invoiceName : (d.existing?.name ?? row.invoiceName),
      included: row.included,
      needsConversion: d.needsConversion,
      priceBlank: d.calc.price == null && !d.needsConversion && d.calc.taxAdjustedUnitPrice == null && taxBasis != null,
      conversionError: d.conversionError,
      estimateUnconfirmed: d.unconfirmedEstimate,
    })),
  });
  const newNameErrors = pending
    .filter(({ row }) => row.target === "new" && (!row.newName.trim() || !row.newUnit.trim()))
    .map(({ row }) => `${row.invoiceName}: 新しい食材の名前と単位を入れてください`);
  const allBlockers = [...blockers, ...newNameErrors];
  const pageNotice = pagesMismatchNotice(pages);
  const duplicate = invoice ? findPossibleDuplicate({ invoiceDate: invoice.date, supplier: invoice.supplier, totalAmount: invoice.totalAmount }, invoiceRecords) : null;

  async function handleConfirm() {
    if (!rows) return;
    if (allBlockers.length > 0) {
      setShowBlockers(true);
      return;
    }
    setConfirming(true);
    let updated = 0;
    let created = 0;
    let failed = 0;
    const savedIds = new Map<string, string>();
    const priceUpdates: { ingredientId: string; newPrice: number }[] = [];
    // 同時に大量の保存が走って店舗の食材の一意の決まりに引っかかる事故を避けるため、順番に保存する
    for (const { row, d } of pending) {
      const price = d.calc.price;
      if (price == null) continue;
      updateRow(row.key, { status: "saving", error: null });
      if (row.target === "new") {
        const result = await createIngredient({ storeId, name: row.newName, unit: row.newUnit, purchasePrice: price, priceIsSet: true, yieldRatePercent: 100 });
        if (result.success) {
          created += 1;
          savedIds.set(row.key, result.ingredient.id);
          updateRow(row.key, { status: "saved", savedIngredientId: result.ingredient.id });
        } else {
          failed += 1;
          updateRow(row.key, { status: "error", error: result.error });
        }
      } else {
        const existing = d.existing;
        const result = await updateIngredient({
          storeId,
          ingredientId: row.target,
          name: existing?.name ?? row.newName,
          purchasePrice: price,
          priceIsSet: true,
          yieldRatePercent: existing?.yieldRatePercent ?? 100,
        });
        if (result.success) {
          updated += 1;
          savedIds.set(row.key, row.target);
          priceUpdates.push({ ingredientId: row.target, newPrice: price });
          updateRow(row.key, { status: "saved", savedIngredientId: row.target });
        } else {
          failed += 1;
          updateRow(row.key, { status: "error", error: result.error });
        }
      }
    }

    // 換算を覚える(確かめていない目安は conversionToSave が外す)
    const toRemember: ConversionRowToSave[] = [];
    for (const { row } of pending) {
      const id = savedIds.get(row.key);
      const c = conversionToSave({ included: row.included, rowSaved: id != null, ingredientId: id ?? "", purchaseUnit: row.invoiceUnit, conversion: row.conversion });
      if (c) toRemember.push(c);
    }
    let remembered = 0;
    let conversionError: string | null = null;
    if (toRemember.length > 0) {
      const r = await rememberConversions(toRemember);
      if (r.success) remembered = r.saved;
      else conversionError = r.error;
    }

    // 名前の対応を覚える(店主が登録先を選び直し、「この名前を覚える」に印がある行だけ。aliasToSave)
    const aliasRows: AliasRowToSave[] = [];
    for (const { row } of pending) {
      const id = savedIds.get(row.key);
      const chosen = row.target === "new" ? null : existingById.get(row.target);
      const a = aliasToSave({
        invoiceName: row.invoiceName,
        chosen: chosen ? { id: chosen.id, name: chosen.name } : null,
        autoMatched: row.target === row.autoMatchedId,
        remember: row.rememberName,
        rowSaved: id != null,
      });
      if (a && !aliasRows.some((x) => x.normalized_alias === a.normalized_alias)) aliasRows.push(a);
    }
    let namesRemembered = 0;
    if (aliasRows.length > 0) {
      const r = await rememberAliases(storeId, aliasRows);
      if (r.success) namesRemembered = r.saved;
      else conversionError = conversionError ? `${conversionError} ${r.error}` : r.error;
    }

    // 二度読みに気づくための記録(日付・仕入れ先・合計がそろっていて、1件以上確定したときだけ)
    if (savedIds.size > 0 && invoice?.date && invoice.supplier && invoice.totalAmount != null) {
      await recordInvoiceScan({ storeId, invoiceDate: invoice.date, supplier: invoice.supplier, totalAmount: invoice.totalAmount });
    }

    // 原価率が変わったメニュー(単価を更新した登録済みの食材を使うメニュー。新しく登録した食材は、まだどのメニューにも使われていない)
    const menus = costData && priceUpdates.length > 0 ? affectedMenus({ ...costData, updates: priceUpdates }) : [];
    setDone({ updated, created, remembered, namesRemembered, failed, conversionError, menus });
    setConfirming(false);
    setShowBlockers(false);
    router.refresh();
  }

  const reviewRows = rowViews.filter((v) => v.row.needsReview);
  const usualRows = rowViews.filter((v) => !v.row.needsReview);

  function renderRow({ row, d }: { row: Row; d: ReturnType<typeof derive> }) {
    const locked = row.status === "saved" || row.status === "saving" || confirming;
    const reasonCtx = {
      invoiceUnit: row.invoiceUnit,
      ingredientUnit: d.ingredientUnit,
      note: row.note,
      previousPrice: d.previousPrice,
      newPrice: d.calc.price,
    };
    const filter = normalizeForDedupe(row.search);
    const options = existingIngredients.filter((i) => !filter || normalizeForDedupe(i.name).includes(filter) || i.id === row.target);
    const quantityText = row.quantity ? `${row.quantity}${row.invoiceUnit}` : "";
    const amountText = row.totalAmount != null ? formatYen(row.totalAmount) : "";
    return (
      <li key={row.key} className="flex min-w-0 flex-col gap-3 rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: "var(--foreground)", ...JP }}>
            納品書: {row.invoiceName} {quantityText} {amountText}
          </p>
          {row.status === "saved" && <StatusBadge status="ok" label="確定済み" />}
        </div>

        {d.reasons.length > 0 && row.status !== "saved" && (
          <ul className="flex flex-col gap-1">
            {d.reasons.map((reason: ReviewReason) => (
              <li key={reason} className="text-sm [overflow-wrap:anywhere]" style={{ color: "var(--status-warn)", ...JP }}>
                ⚠ {reasonLabel(reason, reasonCtx, d)}
              </li>
            ))}
          </ul>
        )}

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
          <input type="checkbox" checked={row.included} disabled={locked} onChange={(e) => updateRow(row.key, { included: e.target.checked })} />
          この行を確定する(外すと、この行は何も変えません)
        </label>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
            <span>登録先</span>
            {existingIngredients.length > 8 && (
              <input
                value={row.search}
                onChange={(e) => updateRow(row.key, { search: e.target.value })}
                disabled={locked}
                placeholder="食材の名前で探す"
                aria-label="登録先の食材を探す"
                className={INPUT_CLASS}
                style={inputStyle}
              />
            )}
            <select
              value={row.target}
              onChange={(e) => updateRowAndConversion(row.key, { target: e.target.value })}
              disabled={locked}
              aria-label="登録先"
              className={INPUT_CLASS}
              style={inputStyle}
            >
              <option value="new">新しい食材として登録</option>
              {options.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}({i.unit})の単価を更新
                </option>
              ))}
            </select>
            {row.candidateIds.length > 0 && row.target === "new" && !locked && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
                <span>登録済みの似た食材:</span>
                {row.candidateIds.map((id) => {
                  const c = existingById.get(id);
                  if (!c) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateRowAndConversion(row.key, { target: id })}
                      className="rounded border px-3 py-1.5 text-sm font-semibold [overflow-wrap:anywhere]"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)", ...JP }}
                    >
                      {c.name}を選ぶ
                    </button>
                  );
                })}
              </div>
            )}
            {row.target !== "new" && row.target !== row.autoMatchedId && (
              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={row.rememberName}
                  disabled={locked}
                  onChange={(e) => updateRow(row.key, { rememberName: e.target.checked })}
                />
                <span className="[overflow-wrap:anywhere]">
                  この名前を覚える(次から「{row.invoiceName}」は「{d.existing?.name ?? ""}」を自動で選びます)
                </span>
              </label>
            )}
            {row.target !== "new" && row.target === row.autoMatchedId && normalizeForDedupe(row.invoiceName) !== normalizeForDedupe(d.existing?.name ?? "") && (
              <p className="text-xs" style={{ color: "var(--muted-foreground)", ...JP }}>
                前に選んだ対応、または名前の書き方の違い(カタカナ・ひらがな等)から、自動で選びました。
              </p>
            )}
          </div>

          {row.target === "new" ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2">
              <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
                新しい食材の名前
                <input value={row.newName} disabled={locked} onChange={(e) => updateRowAndConversion(row.key, { newName: e.target.value })} className={INPUT_CLASS} style={inputStyle} />
              </label>
              <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
                食材の単位
                <input
                  value={row.newUnit}
                  disabled={locked}
                  list="scan-unit-options"
                  placeholder="g"
                  onChange={(e) => updateRowAndConversion(row.key, { newUnit: e.target.value })}
                  className={INPUT_CLASS}
                  style={inputStyle}
                />
              </label>
            </div>
          ) : (
            <p className="self-end text-xs" style={{ color: "var(--muted-foreground)", ...JP }}>
              登録済みの食材の名前と単位は、ここでは変えません。単位が違うときは、下の換算で合わせます。
            </p>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
            数量
            <input value={row.quantity} disabled={locked} inputMode="decimal" onChange={(e) => updateRow(row.key, { quantity: e.target.value })} className={INPUT_CLASS + " font-mono"} style={inputStyle} />
          </label>
          <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
            納品書の単位
            <input
              value={row.invoiceUnit}
              disabled={locked}
              list="scan-unit-options"
              onChange={(e) => updateRowAndConversion(row.key, { invoiceUnit: e.target.value })}
              className={INPUT_CLASS}
              style={inputStyle}
            />
          </label>
          <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
            納品書の単価(円)
            <input
              value={row.unitPrice}
              disabled={locked}
              inputMode="decimal"
              placeholder={row.totalAmount != null ? "金額÷数量" : ""}
              onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
              className={INPUT_CLASS + " font-mono"}
              style={inputStyle}
            />
          </label>
          <label className={LABEL_CLASS} style={{ color: "var(--foreground)", ...JP }}>
            税率
            <select value={row.taxRate} disabled={locked} onChange={(e) => updateRow(row.key, { taxRate: e.target.value === "10" ? 10 : 8 })} className={INPUT_CLASS} style={inputStyle}>
              <option value={8}>8%(食品)</option>
              <option value={10}>10%(酒・資材など)</option>
            </select>
          </label>
        </div>

        {row.conversion && (
          <div className="flex min-w-0 flex-col gap-2 rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
              <span>換算: 1{row.invoiceUnit} =</span>
              <input
                value={row.conversion.value}
                disabled={locked}
                inputMode="decimal"
                aria-label={`1${row.invoiceUnit}あたりの${d.ingredientUnit}`}
                onChange={(e) => updateRow(row.key, (r) => ({ conversion: r.conversion ? editConversionValue(r.conversion, e.target.value) : null }))}
                className="w-24 min-w-0 rounded border px-2 py-2 text-base font-mono focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <span>{row.conversion.unit}</span>
              {row.conversion.source === "estimate" && <StatusBadge status="warn" label="目安" />}
              {row.conversion.source === "remembered" && <StatusBadge status="muted" label="前回覚えた値" />}
            </div>
            {row.conversion.source === "estimate" && (
              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={row.conversion.estimateConfirmed}
                  disabled={locked}
                  onChange={(e) => updateRow(row.key, (r) => ({ conversion: r.conversion ? confirmEstimate(r.conversion, e.target.checked) : null }))}
                />
                この値で正しい(目安は一般的な重さです。お店の仕入れに合わせて確かめてください)
              </label>
            )}
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)", ...JP }}>
              <input
                type="checkbox"
                checked={row.conversion.remember}
                disabled={locked}
                onChange={(e) => updateRow(row.key, (r) => ({ conversion: r.conversion ? { ...r.conversion, remember: e.target.checked } : null }))}
              />
              この換算を覚える(次の納品書から自動で使います)
            </label>
            {d.conversionError && <p className="text-sm" style={{ color: "var(--status-danger)", ...JP }}>{d.conversionError}</p>}
          </div>
        )}

        <p className="text-sm [overflow-wrap:anywhere]" style={{ color: "var(--foreground)", ...JP }}>
          {d.calc.price != null ? (
            <>
              登録する単価: <span className="font-mono font-bold">{formatYen(d.calc.price)}</span>/{d.ingredientUnit}({ingredientPriceTaxModeLabel(storeTaxMode)})
              {d.previousPrice != null && (
                <span style={{ color: "var(--muted-foreground)" }}>
                  {" "}
                  前回 {formatYen(d.previousPrice)}/{d.ingredientUnit}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--muted-foreground)" }}>
              {taxBasis == null ? "上で、納品書の金額が税込か税抜かを選ぶと、単価を計算します" : d.needsConversion ? "換算を入れると、単価を計算します" : "単価か金額を入れると、単価を計算します"}
            </span>
          )}
        </p>

        {row.error && <ActionErrorMessage error={row.error} />}
      </li>
    );
  }

  return (
    <div className="mt-6 flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-base" style={{ color: "var(--foreground)", ...JP }}>
          納品書・請求書の写真・PDF
        </p>
        <p className="text-sm" style={{ color: "var(--muted-foreground)", ...JP }}>
          {MULTI_PAGE_HINT}(写真は{MAX_PHOTOS}枚まで、PDFは1つ・5ページまで)
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="cursor-pointer rounded border px-4 py-3 text-center text-base font-semibold" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            {picked.some((p) => p.kind === "image") ? "もう1枚撮る" : "写真を撮る"}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.target.files)} className="sr-only" />
          </label>
          <label className="cursor-pointer rounded border px-4 py-3 text-center text-base font-semibold" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            写真・PDFから選ぶ
            <input
              ref={pickInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="sr-only"
            />
          </label>
        </div>
        {picked.length > 0 && (
          <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3" aria-label="選んだ写真・PDF">
            {picked.map((p, i) => (
              <li key={p.key} className="flex min-w-0 flex-col gap-1 rounded border p-2" style={{ borderColor: "var(--border)" }}>
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt={`${i + 1}枚目`} className="h-28 w-full rounded object-contain" />
                ) : (
                  <div className="flex h-28 items-center justify-center rounded text-base font-bold" style={{ background: "var(--muted)", color: "var(--foreground)", ...JP }}>
                    PDF
                  </div>
                )}
                <span className="text-xs [overflow-wrap:anywhere]" style={{ color: "var(--muted-foreground)", ...JP }}>
                  {i + 1}枚目: {p.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(p.key)}
                  disabled={scanning}
                  className="self-start rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", ...JP }}
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
        {scanError && <ActionErrorMessage error={scanError} />}
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning || remaining <= 0}
          className="self-start rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", ...JP }}
        >
          {scanning ? "読み取り中…" : picked.length > 1 ? `${picked.length}枚をまとめて読み取る` : picked[0]?.kind === "pdf" ? "このPDFを読み取る" : "この写真を読み取る"}
        </button>
        <p className="text-sm" style={{ color: "var(--muted-foreground)", ...JP }}>
          {remaining > 0
            ? `今月の読み取り: あと${remaining}回(読み取りに成功したときに数えます。毎月1日に元に戻ります)`
            : "今月の読み取りの回数の上限に達しました。来月1日に、回数が元に戻ります。"}
        </p>
      </div>

      {rows && rows.length > 0 && invoice && (
        <div className="flex min-w-0 flex-col gap-4">
          {/* 納品書全体: 日付・仕入れ先・合計、二度読みのお知らせ、税込・税抜 */}
          <section className="flex min-w-0 flex-col gap-3 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }} aria-label="納品書の情報">
            <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm" style={{ color: "var(--foreground)", ...JP }}>
              <dt style={{ color: "var(--muted-foreground)" }}>日付</dt>
              <dd className="[overflow-wrap:anywhere]">{invoice.date ?? "読み取れませんでした"}</dd>
              <dt style={{ color: "var(--muted-foreground)" }}>仕入れ先</dt>
              <dd className="[overflow-wrap:anywhere]">{invoice.supplier ?? "読み取れませんでした"}</dd>
              <dt style={{ color: "var(--muted-foreground)" }}>合計</dt>
              <dd className="[overflow-wrap:anywhere]">{invoice.totalAmount != null ? formatYen(invoice.totalAmount) : "読み取れませんでした"}</dd>
            </dl>
            {pageNotice && (
              <p className="rounded border p-3 text-sm [overflow-wrap:anywhere]" style={{ borderColor: "var(--status-warn)", color: "var(--foreground)", ...JP }}>
                ⚠ {pageNotice}
              </p>
            )}
            {duplicate && (
              <p className="rounded border p-3 text-sm" style={{ borderColor: "var(--status-warn)", color: "var(--foreground)", ...JP }}>
                ⚠ {duplicateNotice(duplicate)}
              </p>
            )}
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-semibold" style={{ color: "var(--foreground)", ...JP }}>
                この納品書の金額は
              </legend>
              <div className="flex flex-wrap gap-4 text-base" style={{ color: "var(--foreground)", ...JP }}>
                {(["exclusive", "inclusive"] as const).map((b) => (
                  <label key={b} className="flex items-center gap-2">
                    <input type="radio" name="invoice-tax-basis" checked={taxBasis === b} disabled={confirming} onChange={() => setTaxBasis(b)} />
                    {b === "exclusive" ? "税抜" : "税込"}
                  </label>
                ))}
              </div>
              <p className="text-xs" style={{ color: taxBasis == null ? "var(--status-warn)" : "var(--muted-foreground)", ...JP }}>
                {taxBasis == null
                  ? "納品書の記載から判定できませんでした。納品書を見て選んでください(「税抜」「外税」「消費税 別」なら税抜)。"
                  : taxBasisFromAi
                    ? "納品書の記載から判定しました。違っていたら選び直してください。"
                    : ""}
                お店の設定では、仕入単価を{ingredientPriceTaxModeLabel(storeTaxMode)}で入れています。{ingredientPriceTaxModeLabel(storeTaxMode)}にそろえて登録します。
              </p>
            </fieldset>
          </section>

          {done && (
            <section className="flex min-w-0 flex-col gap-2 rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--status-ok)" }} aria-label="確定の結果">
              <p className="text-base font-bold" style={{ color: "var(--foreground)", ...JP }}>
                確定しました
              </p>
              <p className="text-sm" style={{ color: "var(--foreground)", ...JP }}>
                単価を更新: {done.updated}件・新しく登録: {done.created}件・換算を覚えた: {done.remembered}件・名前を覚えた: {done.namesRemembered}件
                {done.failed > 0 && `・確定できなかった: ${done.failed}件(下の行に理由があります)`}
              </p>
              {done.conversionError && <ActionErrorMessage error={done.conversionError} />}
              {done.menus.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--foreground)", ...JP }}>
                    原価率が変わったメニュー({done.menus.length}件)
                  </p>
                  <ul className="flex min-w-0 flex-col gap-2">
                    {done.menus.map((m) => (
                      <li key={m.menuId} className="flex min-w-0 flex-col gap-1 rounded border p-3 text-sm" style={{ borderColor: "var(--border)", ...JP }}>
                        <span className="font-semibold [overflow-wrap:anywhere]" style={{ color: "var(--foreground)" }}>
                          {m.name}
                        </span>
                        {m.unsetText ? (
                          <span className="[overflow-wrap:anywhere]" style={{ color: "var(--muted-foreground)" }}>
                            {m.unsetText}
                          </span>
                        ) : (
                          <span className="[overflow-wrap:anywhere]" style={{ color: "var(--foreground)" }}>
                            原価率 {m.beforeRateText ?? "—"} → <span className="font-bold">{m.afterRateText}</span>
                            {m.changeText && `(${m.changeText})`}
                          </span>
                        )}
                        {m.targetLabel && (
                          <span className="self-start">
                            <StatusBadge status={m.targetLabel.endsWith("超えました") ? "danger" : "warn"} label={m.targetLabel} wrap />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                done.updated > 0 && (
                  <p className="text-sm" style={{ color: "var(--muted-foreground)", ...JP }}>
                    原価率が変わったメニューはありません(更新した食材を使っているメニューがありません)。
                  </p>
                )
              )}
              <Link href="/ranking" className="self-start text-sm underline" style={{ color: "var(--accent)", ...JP }}>
                メニューの原価率を見る
              </Link>
            </section>
          )}

          {reviewRows.length > 0 && (
            <section className="flex min-w-0 flex-col gap-3" aria-label="要確認">
              <h2 className="text-base font-bold" style={{ color: "var(--foreground)", ...JP }}>
                要確認 {reviewRows.length}件
              </h2>
              <ul className="flex min-w-0 flex-col gap-3">{reviewRows.map(renderRow)}</ul>
            </section>
          )}

          {usualRows.length > 0 && (
            <details className="flex min-w-0 flex-col gap-3 rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }} open={reviewRows.length === 0}>
              <summary className="cursor-pointer text-base font-bold" style={{ color: "var(--foreground)", ...JP }}>
                いつもどおり {usualRows.length}件(前回から±10%未満)
              </summary>
              <ul className="mt-3 flex min-w-0 flex-col gap-3">{usualRows.map(renderRow)}</ul>
            </details>
          )}

          <datalist id="scan-unit-options">
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          {/* 画面の下に固定の「確定する」 */}
          {pending.length > 0 && (
            <div className="sticky bottom-0 z-10 -mx-1 flex min-w-0 flex-col gap-2 border-t px-1 py-3" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
              {showBlockers && allBlockers.length > 0 && (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm" style={{ color: "var(--status-danger)", ...JP }} role="alert">
                  {allBlockers.map((b) => (
                    <li key={b} className="[overflow-wrap:anywhere]">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", ...JP }}
              >
                {confirming ? "確定中…" : `${pending.length}件を確定する`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 要確認の理由の文言。目安のまま確かめていないときは、その旨を出す */
function reasonLabel(
  reason: ReviewReason,
  ctx: Parameters<typeof reviewReasonLabel>[1],
  d: { unconfirmedEstimate: boolean; needsConversion: boolean },
): string {
  if (reason === "needs_conversion" && d.unconfirmedEstimate && !d.needsConversion) {
    return `1${ctx.invoiceUnit ?? ""}が何${ctx.ingredientUnit ?? ""}かを確かめてください(目安の値が入っています)`;
  }
  return reviewReasonLabel(reason, ctx);
}
