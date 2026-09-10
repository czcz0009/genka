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
import { SearchablePicker, type PickerOption } from "@/components/SearchablePicker.tsx";
import { StatusBadge, type BadgeStatus } from "@/components/StatusBadge.tsx";
import { Notice } from "@/components/Notice.tsx";

type Step = "upload" | "map" | "confirm";

const PREVIEW_ROW_COUNT = 30;

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
    <div className="flex flex-col gap-6">
      <StepIndicator step={step} />

      {step === "upload" && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed px-6 py-14 text-center"
          style={{ borderColor: fileName ? "var(--status-ok)" : "var(--border)" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <span className="text-3xl">{fileName ? "✓" : "↑"}</span>
          <p className="text-sm" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
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
          {isParsing && (
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              読み込み中…
            </p>
          )}
          {parseError && (
            <p className="text-xs" style={{ color: "var(--status-danger)" }}>
              {parseError}
            </p>
          )}
          <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            列の並びは自由です。「メニュー名・食材名・分量・単位・仕入単価・売価」に近い列を自動で推測します。
          </p>
          <SampleTableHelp />
        </div>
      )}

      {step === "map" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {fileName} ・ {rows.length}行を読み込みました
            </p>
            <button
              onClick={resetAll}
              className="rounded px-3 py-2 text-sm underline underline-offset-2 transition-colors hover:bg-[color:var(--muted)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              別のファイルを選び直す
            </button>
          </div>

          <MappingTable headers={headers} mapping={mapping} setMapping={setMapping} suggestions={suggestions} />

          <PreviewTable headers={headers} rows={rows.slice(0, 5)} mapping={mapping} />

          {applyResult.menuNameFills.length > 0 && (
            <MenuNameFillNotice fills={applyResult.menuNameFills} />
          )}

          <div className="flex flex-col gap-2 rounded border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            <p>
              取り込み可能な行: <strong>{applyResult.rows.length}</strong> 件 / エラー行:{" "}
              <strong style={applyResult.errors.length > 0 ? { color: "var(--status-danger)" } : undefined}>
                {applyResult.errors.length}
              </strong>{" "}
              件
            </p>
            {requiredMissing.length > 0 && (
              <p style={{ color: "var(--status-warn)" }}>
                必須項目が未設定です: {requiredMissing.map((f) => f.label).join("・")}。上の表の「対応する列」でどの列か選んでください。
              </p>
            )}
            {applyResult.errors.length > 0 && (
              <details className="text-xs" style={{ color: "var(--muted-foreground)" }}>
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
              className="rounded px-5 py-3 text-base font-bold transition-colors disabled:opacity-30"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
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
          style={{
            color: idx <= currentIdx ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: idx <= currentIdx ? 600 : 400,
          }}
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
    <details className="mt-2 w-full max-w-lg text-xs" style={{ color: "var(--muted-foreground)" }}>
      <summary className="cursor-pointer select-none text-center">どんな表が取り込めるか見本を見る</summary>
      <div className="mt-3 overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-left text-xs">
          <thead style={{ background: "var(--muted)" }}>
            <tr>
              {SAMPLE_TABLE_HEADERS.map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium" style={{ color: "var(--foreground)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_TABLE_ROWS.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1.5" style={{ color: "var(--foreground)" }}>
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
  // ネイティブの<select>は開いたポップアップの見た目を制御できず見づらいという
  // 指摘を受けて、検索絞り込みつきの一覧(SearchablePicker)に統一した。
  // 1行1列のテーブルにこの一覧を詰め込むと縦に間延びするため、表形式ではなく
  // 項目ごとのカードに組み直している。
  const columnOptions: PickerOption[] = [
    { value: "", label: "(選択しない)" },
    ...headers.map((h, idx) => ({ value: String(idx), label: h })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {FIELD_DEFS.map((field) => {
        const s = suggestionByField.get(field.id);
        const value = mapping[field.id];
        const level = s?.level ?? "none";
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
                onChange={(v) => setMapping({ ...mapping, [field.id]: v === "" ? null : Number(v) })}
                searchPlaceholder="列名で絞り込む"
                selectedLabelPrefix="対応する列"
              />
            </div>
          </div>
        );
      })}
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
    <Notice tone="info" title={`メニュー名を${fills.length}行分、直前の行から自動補完しました`}>
      <p className="text-xs opacity-90">
        Excelでメニュー名のセルを複数行にまたがって結合している場合などに、空欄になった行へ直前の値を引き継いでいます。意図と違う場合はマッピングまたは元データを確認してください。
      </p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-4 text-xs opacity-90">
        {fills.map((f, i) => (
          <li key={i}>
            {f.sheetRow}行目が空欄だったため、「{f.menuName}」({f.filledFromSheetRow}行目の値)を引き継ぎました
          </li>
        ))}
      </ul>
    </Notice>
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
      <p className="mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
        プレビュー(先頭5行)
      </p>
      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs">
          <thead style={{ background: "var(--muted)" }}>
            <tr>
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
                  style={{ color: mappedColumns.has(idx) ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-t" style={{ borderColor: "var(--border)" }}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="whitespace-nowrap px-2 py-1.5"
                    style={{ color: mappedColumns.has(cIdx) ? "var(--foreground)" : "var(--muted-foreground)" }}
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
