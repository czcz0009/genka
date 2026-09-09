"use client";

import { useMemo, useState } from "react";
import { parseSpreadsheetFile } from "@/lib/parseFile";
import { suggestColumnMapping } from "@/lib/mapping/columnMapper";
import { SALES_FIELD_DEFS, type SalesFieldId } from "@/lib/salesImport/salesFields";
import { applySalesMapping, type SalesFinalMapping } from "@/lib/salesImport/applySalesMapping";
import { formatMonthLabel } from "@/lib/period/month";
import { saveSalesImportPlan } from "./actions.ts";

const LEVEL_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  none: "bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50",
};
const LEVEL_LABEL: Record<string, string> = {
  high: "自動で判定できました",
  medium: "確認してください",
  none: "手動で選んでください",
};

export function SalesImportPanel({
  storeId,
  month,
  onSaved,
}: {
  storeId: string;
  month: string;
  onSaved: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<SalesFinalMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<
    { success: true; savedCount: number; skippedMenuNames: string[] } | { success: false; error: string } | null
  >(null);

  const suggestions = useMemo(
    () => suggestColumnMapping(headers, rows.slice(0, 30), SALES_FIELD_DEFS),
    [headers, rows],
  );
  const applyResult = useMemo(() => applySalesMapping(rows, mapping), [rows, mapping]);

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.headers.length === 0) {
        setParseError("ファイルからデータを読み取れませんでした。1行目に列見出しがあるか確認してください。");
        return;
      }
      setFileName(parsed.fileName);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const suggested = suggestColumnMapping(parsed.headers, parsed.rows.slice(0, 30), SALES_FIELD_DEFS);
      const initial: SalesFinalMapping = {};
      for (const s of suggested) initial[s.fieldId] = s.columnIndex;
      setMapping(initial);
    } catch {
      setParseError("ファイルの読み込みに失敗しました。CSVまたはExcel(.xlsx)形式か確認してください。");
    }
  }

  const requiredMissing = SALES_FIELD_DEFS.filter((f) => f.required && mapping[f.id] == null);

  async function handleConfirm() {
    setSaving(true);
    const res = await saveSalesImportPlan({ storeId, month, rows, mapping });
    setSaving(false);
    setResult(res);
    if (res.success) onSaved();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/50 dark:text-white/50">
        メニュー名・販売数量の列があるCSV/Excelを取り込むと、{formatMonthLabel(month)}
        の販売数量として保存します(日別内訳のCSVでも、同じメニュー名の行は自動的に合算します)。
      </p>
      <input
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="text-sm"
      />
      {parseError && <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}

      {headers.length > 0 && (
        <>
          <p className="text-xs text-black/50 dark:text-white/50">{fileName} ・ {rows.length}行</p>
          <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2 font-medium">項目</th>
                  <th className="px-3 py-2 font-medium">対応する列</th>
                  <th className="px-3 py-2 font-medium" title="表の見出しの言葉から、どの列が対応するかを自動で判定した結果です">
                    自動判定の結果
                  </th>
                </tr>
              </thead>
              <tbody>
                {SALES_FIELD_DEFS.map((field) => {
                  const s = suggestions.find((x) => x.fieldId === field.id);
                  const value = mapping[field.id as SalesFieldId];
                  return (
                    <tr key={field.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-3 py-2">
                        {field.label}
                        {field.required && <span className="ml-1 text-red-500">*</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={value == null ? "" : String(value)}
                          onChange={(e) =>
                            setMapping({
                              ...mapping,
                              [field.id]: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                        >
                          <option value="">(選択しない)</option>
                          {headers.map((h, idx) => (
                            <option key={idx} value={idx}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${LEVEL_STYLE[s?.level ?? "none"]}`}>
                          {LEVEL_LABEL[s?.level ?? "none"]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-sm">
            取り込み可能な行: <strong>{applyResult.rows.length}</strong> 件 / エラー行:{" "}
            <strong className={applyResult.errors.length > 0 ? "text-red-600 dark:text-red-400" : ""}>
              {applyResult.errors.length}
            </strong>
            件
          </p>
          {requiredMissing.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              必須項目が未設定です: {requiredMissing.map((f) => f.label).join("・")}
            </p>
          )}

          {result && !result.success && <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>}
          {result && result.success && result.skippedMenuNames.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              登録済みメニューと名前が一致しなかったため{result.skippedMenuNames.length}件スキップしました:{" "}
              {result.skippedMenuNames.join("、")}
              。メニュー一覧で名前が同じか確認するか、先にメニューを登録してから取り込み直してください。
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={saving || requiredMissing.length > 0 || applyResult.rows.length === 0}
            className="self-end rounded-lg bg-black px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {saving ? "保存中…" : "この内容で保存する"}
          </button>
        </>
      )}
    </div>
  );
}
