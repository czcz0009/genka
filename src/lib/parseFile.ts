/**
 * アップロードされた CSV / Excel ファイルをブラウザ上でパースし、
 * 「ヘッダー行 + データ行(文字列の2次元配列)」に統一する。
 *
 * ここで全部の行を読み込むが、マッピング推測やプレビュー表示には
 * 先頭数十行だけ使う(parseFile.ts自体は全件返す)。
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedSheet {
  fileName: string;
  headers: string[];
  rows: string[][];
}

function isExcel(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName);
}

function stripEmptyTrailingRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((cell) => (cell ?? "").trim() === "")) {
    end--;
  }
  return rows.slice(0, end);
}

async function parseCsv(file: File): Promise<string[][]> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length > 0) {
    // 致命的でない行単位のエラーはあり得るため、パース自体は続行する。
    console.warn("CSV parse warnings:", result.errors);
  }
  return result.data;
}

async function parseExcel(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false, // セルの見た目通りの文字列で受け取る(数値の桁落ち等を避ける)
  });
  return rows.map((row) => row.map((cell) => (cell ?? "").toString()));
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const raw = isExcel(file.name) ? await parseExcel(file) : await parseCsv(file);
  const trimmed = stripEmptyTrailingRows(raw);

  if (trimmed.length === 0) {
    return { fileName: file.name, headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = trimmed;
  const headers = headerRow.map((h, i) => (h?.trim() ? h.trim() : `列${i + 1}`));
  const width = headers.length;
  const rows = dataRows.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });

  return { fileName: file.name, headers, rows };
}
