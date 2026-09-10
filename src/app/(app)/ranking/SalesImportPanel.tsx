"use client";

import { useMemo, useState } from "react";
import { parseSpreadsheetFile } from "@/lib/parseFile";
import { suggestColumnMapping } from "@/lib/mapping/columnMapper";
import { SALES_FIELD_DEFS, type SalesFieldId } from "@/lib/salesImport/salesFields";
import { applySalesMapping, type SalesFinalMapping } from "@/lib/salesImport/applySalesMapping";
import { formatMonthLabel } from "@/lib/period/month";
import { SearchablePicker, type PickerOption } from "@/components/SearchablePicker.tsx";
import { StatusBadge, type BadgeStatus } from "@/components/StatusBadge.tsx";
import { saveSalesImportPlan } from "./actions.ts";

const LEVEL_STATUS: Record<string, BadgeStatus> = {
  high: "ok",
  medium: "warn",
  none: "muted",
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
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
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
      {parseError && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {parseError}
        </p>
      )}

      {headers.length > 0 && (
        <>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {fileName} ・ {rows.length}行
          </p>
          {/* ネイティブの<select>は見づらいという指摘を受け、検索絞り込みつきの
              一覧(SearchablePicker)に統一。テーブルではなく項目ごとのカードにする。 */}
          <div className="flex flex-col gap-4">
            {SALES_FIELD_DEFS.map((field) => {
              const s = suggestions.find((x) => x.fieldId === field.id);
              const value = mapping[field.id as SalesFieldId];
              const level = s?.level ?? "none";
              const columnOptions: PickerOption[] = [
                { value: "", label: "(選択しない)" },
                ...headers.map((h, idx) => ({ value: String(idx), label: h })),
              ];
              return (
                <div key={field.id} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-medium" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
                      {field.label}
                      {field.required && (
                        <span className="ml-1" style={{ color: "var(--status-danger)" }}>
                          *
                        </span>
                      )}
                    </p>
                    <span title="表の見出しの言葉から、どの列が対応するかを自動で判定した結果です">
                      <StatusBadge status={LEVEL_STATUS[level]} label={LEVEL_LABEL[level]} />
                    </span>
                  </div>
                  <div className="mt-3">
                    <SearchablePicker
                      options={columnOptions}
                      value={value == null ? "" : String(value)}
                      onChange={(v) =>
                        setMapping({ ...mapping, [field.id]: v === "" ? null : Number(v) })
                      }
                      searchPlaceholder="列名で絞り込む"
                      selectedLabelPrefix="対応する列"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            取り込み可能な行: <strong>{applyResult.rows.length}</strong> 件 / エラー行:{" "}
            <strong style={applyResult.errors.length > 0 ? { color: "var(--status-danger)" } : undefined}>
              {applyResult.errors.length}
            </strong>
            件
          </p>
          {requiredMissing.length > 0 && (
            <p className="text-sm" style={{ color: "var(--status-warn)" }}>
              必須項目が未設定です: {requiredMissing.map((f) => f.label).join("・")}。上のカードで対応する列を選んでください。
            </p>
          )}

          {result && !result.success && (
            <p className="text-sm" style={{ color: "var(--status-danger)" }}>
              {result.error}
            </p>
          )}
          {result && result.success && result.skippedMenuNames.length > 0 && (
            <p className="text-sm" style={{ color: "var(--status-warn)" }}>
              登録済みメニューと名前が一致しなかったため{result.skippedMenuNames.length}件スキップしました:{" "}
              {result.skippedMenuNames.join("、")}
              。メニュー一覧で名前が同じか確認するか、先にメニューを登録してから取り込み直してください。
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={saving || requiredMissing.length > 0 || applyResult.rows.length === 0}
            className="self-end rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
          >
            {saving ? "保存中…" : "この内容で保存する"}
          </button>
        </>
      )}
    </div>
  );
}
