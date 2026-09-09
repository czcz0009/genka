"use client";

import { useMemo, useRef, useState } from "react";
import { parseSpreadsheetFile } from "@/lib/parseFile";
import { suggestColumnMapping } from "@/lib/mapping/columnMapper";
import { FIELD_DEFS } from "@/lib/mapping/fields";
import {
  applyMapping,
  buildImportPlan,
  type FinalMapping,
  type MenuNameFill,
} from "@/lib/mapping/applyMapping";
import { ConfirmStep } from "./ConfirmStep.tsx";

type Step = "upload" | "map" | "confirm";

const PREVIEW_ROW_COUNT = 30;

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

export function ImportWizard({ storeId }: { storeId: string | null }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<FinalMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => suggestColumnMapping(headers, rows.slice(0, PREVIEW_ROW_COUNT)),
    [headers, rows],
  );

  const applyResult = useMemo(() => applyMapping(rows, mapping), [rows, mapping]);
  const plan = useMemo(() => buildImportPlan(applyResult.rows), [applyResult.rows]);

  async function handleFile(file: File) {
    setIsParsing(true);
    setParseError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.headers.length === 0) {
        setParseError("ファイルからデータを読み取れませんでした。1行目に列見出しがあるか確認してください。");
        return;
      }
      setFileName(parsed.fileName);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const suggested = suggestColumnMapping(parsed.headers, parsed.rows.slice(0, PREVIEW_ROW_COUNT));
      const initialMapping: FinalMapping = {};
      for (const s of suggested) initialMapping[s.fieldId] = s.columnIndex;
      setMapping(initialMapping);
      setStep("map");
    } catch {
      setParseError("ファイルの読み込みに失敗しました。CSVまたはExcel(.xlsx)形式か確認してください。");
    } finally {
      setIsParsing(false);
    }
  }

  function resetAll() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const requiredMissing = FIELD_DEFS.filter((f) => f.required && mapping[f.id] == null);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <StepIndicator step={step} />

      {step === "upload" && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-black/15 px-6 py-14 text-center dark:border-white/15"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <p className="text-sm text-black/70 dark:text-white/70">
            レシピ・仕入れデータのCSV/Excelファイルをここにドラッグ&ドロップ、または選択してください
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {isParsing && <p className="text-xs text-black/50 dark:text-white/50">読み込み中…</p>}
          {parseError && <p className="text-xs text-red-600 dark:text-red-400">{parseError}</p>}
          <p className="mt-2 text-xs text-black/40 dark:text-white/40">
            列の並びは自由です。「メニュー名・食材名・分量・単位・仕入単価・売価」に近い列を自動で推測します。
          </p>
          <SampleTableHelp />
        </div>
      )}

      {step === "map" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-black/60 dark:text-white/60">
              {fileName} ・ {rows.length}行を読み込みました
            </p>
            <button
              onClick={resetAll}
              className="rounded-lg px-3 py-2 text-sm text-black/50 underline underline-offset-2 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              別のファイルを選び直す
            </button>
          </div>

          <MappingTable headers={headers} mapping={mapping} setMapping={setMapping} suggestions={suggestions} />

          <PreviewTable headers={headers} rows={rows.slice(0, 5)} mapping={mapping} />

          {applyResult.menuNameFills.length > 0 && (
            <MenuNameFillNotice fills={applyResult.menuNameFills} />
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <p>
              取り込み可能な行: <strong>{applyResult.rows.length}</strong> 件 / エラー行:{" "}
              <strong className={applyResult.errors.length > 0 ? "text-red-600 dark:text-red-400" : ""}>
                {applyResult.errors.length}
              </strong>{" "}
              件
            </p>
            {requiredMissing.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                必須項目が未設定です: {requiredMissing.map((f) => f.label).join("・")}。上の表の「対応する列」でどの列か選んでください。
              </p>
            )}
            {applyResult.errors.length > 0 && (
              <details className="text-xs text-black/60 dark:text-white/60">
                <summary className="cursor-pointer select-none">エラー内容を見る</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {applyResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      {e.sheetRow}行目: {e.message}
                    </li>
                  ))}
                  {applyResult.errors.length > 20 && <li>ほか{applyResult.errors.length - 20}件…</li>}
                </ul>
              </details>
            )}
          </div>

          <div className="flex justify-end">
            <button
              disabled={requiredMissing.length > 0 || applyResult.rows.length === 0}
              onClick={() => setStep("confirm")}
              className="rounded-lg bg-black px-5 py-3 text-base font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
            >
              この内容で確定する
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <ConfirmStep
          storeId={storeId}
          fileName={fileName}
          plan={plan}
          errorCount={applyResult.errors.length}
          menuNameFills={applyResult.menuNameFills}
          columnMapping={mapping}
          headers={headers}
          onBack={() => setStep("map")}
          onStartOver={resetAll}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "① ファイル選択" },
    { key: "map", label: "② マッピング確認" },
    { key: "confirm", label: "③ 確定" },
  ];
  const order: Step[] = ["upload", "map", "confirm"];
  const currentIdx = order.indexOf(step);
  return (
    <ol className="flex gap-4 text-xs">
      {items.map((item, idx) => (
        <li
          key={item.key}
          className={
            idx <= currentIdx
              ? "font-semibold text-black dark:text-white"
              : "text-black/35 dark:text-white/35"
          }
        >
          {item.label}
        </li>
      ))}
    </ol>
  );
}

const SAMPLE_TABLE_HEADERS = ["メニュー名", "食材名", "分量", "単位", "仕入単価", "売価"];
const SAMPLE_TABLE_ROWS = [
  ["生姜焼き定食", "豚肉", "150", "g", "80", "900"],
  ["生姜焼き定食", "キャベツ", "50", "g", "16", ""],
  ["唐揚げ定食", "鶏もも肉", "180", "g", "85", "850"],
];

/**
 * 「CSV」という言葉だけでは何のことか伝わらない、という指摘を受けて追加した
 * 見本ヘルプ。実際にどんな表なら取り込めるかを、架空の値でそのまま見せる。
 */
function SampleTableHelp() {
  return (
    <details className="mt-2 w-full max-w-lg text-xs text-black/60 dark:text-white/60">
      <summary className="cursor-pointer select-none text-center">どんな表が取り込めるか見本を見る</summary>
      <div className="mt-3 overflow-x-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-black/5 dark:bg-white/10">
            <tr>
              {SAMPLE_TABLE_HEADERS.map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_TABLE_ROWS.map((row, i) => (
              <tr key={i} className="border-t border-black/5 dark:border-white/5">
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2">
        1行が「1つのメニューで使う食材1つ分」です。同じメニューを複数の食材の行に分けて書いてください(上の例では「生姜焼き定食」が2行)。列の順番や見出しの言い回しは自由です。仕入単価・売価は後からでも入力できます。
      </p>
    </details>
  );
}

function MappingTable({
  headers,
  mapping,
  setMapping,
  suggestions,
}: {
  headers: string[];
  mapping: FinalMapping;
  setMapping: (m: FinalMapping) => void;
  suggestions: ReturnType<typeof suggestColumnMapping>;
}) {
  const suggestionByField = new Map(suggestions.map((s) => [s.fieldId, s]));

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-black/5 text-left dark:bg-white/5">
          <tr>
            <th className="px-3 py-2 font-medium">取り込み項目</th>
            <th className="px-3 py-2 font-medium">対応する列</th>
            <th className="px-3 py-2 font-medium" title="表の見出しの言葉から、どの列が対応するかを自動で判定した結果です">
              自動判定の結果
            </th>
          </tr>
        </thead>
        <tbody>
          {FIELD_DEFS.map((field) => {
            const s = suggestionByField.get(field.id);
            const value = mapping[field.id];
            return (
              <tr key={field.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-3 py-2">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                    value={value == null ? "" : String(value)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping({
                        ...mapping,
                        [field.id]: v === "" ? null : Number(v),
                      });
                    }}
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
  );
}

/**
 * メニュー名のforward-fill(Excel結合セル対応)を、見逃されないよう
 * 目立つブロックで明示する。オレンジの小さなバッジは見逃されがちだった反省を踏まえ、
 * 折りたたまず常に内容を表示する。
 */
function MenuNameFillNotice({ fills }: { fills: MenuNameFill[] }) {
  return (
    <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 text-sm dark:border-blue-700/70 dark:bg-blue-900/20">
      <p className="font-semibold text-blue-900 dark:text-blue-200">
        メニュー名を{fills.length}行分、直前の行から自動補完しました
      </p>
      <p className="mt-1 text-blue-800/80 dark:text-blue-300/80">
        Excelでメニュー名のセルを複数行にまたがって結合している場合などに、空欄になった行へ直前の値を引き継いでいます。意図と違う場合はマッピングまたは元データを確認してください。
      </p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-4 text-xs text-blue-900/90 dark:text-blue-200/90">
        {fills.map((f, i) => (
          <li key={i}>
            {f.sheetRow}行目が空欄だったため、「{f.menuName}」({f.filledFromSheetRow}行目の値)を引き継ぎました
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewTable({
  headers,
  rows,
  mapping,
}: {
  headers: string[];
  rows: string[][];
  mapping: FinalMapping;
}) {
  const mappedColumns = new Set(Object.values(mapping).filter((v): v is number => v != null));
  return (
    <div>
      <p className="mb-2 text-xs text-black/50 dark:text-white/50">プレビュー(先頭5行)</p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  className={`whitespace-nowrap px-2 py-1.5 text-left font-medium ${
                    mappedColumns.has(idx) ? "" : "text-black/35 dark:text-white/35"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-t border-black/5 dark:border-white/5">
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`whitespace-nowrap px-2 py-1.5 ${
                      mappedColumns.has(cIdx) ? "" : "text-black/35 dark:text-white/35"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
