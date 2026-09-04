/**
 * 農水省「青果物卸売市場調査(旬別結果)・主要卸売市場計」CSVのパーサ。
 *
 * 実データ(2026年7月下旬分)を1件取得して構造を確認した上で実装している。
 * - 文字コードは Shift_JIS(CP932相当)。Node標準の TextDecoder("shift_jis") で
 *   デコードでき、追加ライブラリは不要。
 * - 先頭数行はタイトル・和暦の対象期間・空行で、5行目が列見出し。
 * - 数値欄が「－」(全角ハイフン)になっている行は欠測値(新規品目で前年同旬比が
 *   算出不能、等)。NFKC正規化後にNumber()がNaNになるため、既存の
 *   parseNumericJa(mapping/numeric.ts)がそのままnullとして扱える。
 * - 「　　うち輸入」のような行は独立した品目ではなく直前行の内訳(再掲)なので、
 *   isBreakdownRow=true としてフラグを立て、食材マッチングの対象から除外する。
 */
import type { Period } from "./period.ts";
import { parseNumericJa } from "../mapping/numeric.ts";
import { reiwaToGregorianYear } from "../reiwa.ts";

export interface SyuyoItem {
  itemCode: string;
  itemName: string;
  /** 「うち輸入」等、親行の内訳の再掲であり独立した品目ではない行 */
  isBreakdownRow: boolean;
  wholesaleQuantityTon: number | null;
  wholesaleValueThousandYen: number | null;
  /** 主要卸売市場計 卸売価格(円/kg)。アラート判定の基準値。 */
  pricePerKg: number | null;
  yoyQuantityPercent: number | null;
  yoyPricePercent: number | null;
  prevThirdQuantityPercent: number | null;
  prevThirdPricePercent: number | null;
}

export interface ParsedSyuyoCsv {
  /** タイトル行から読み取れた対象期間(和暦→西暦に変換済み)。読み取れなければnull */
  period: Period | null;
  items: SyuyoItem[];
}

const HEADER_MARKER = "品目名";
const REIWA_PATTERN = /令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(上|中|下)\s*旬/;

function parseReiwaPeriod(text: string): Period | null {
  const m = text.match(REIWA_PATTERN);
  if (!m) return null;
  const month = Number(m[2]);
  const third = m[3] === "上" ? 1 : m[3] === "中" ? 2 : 3;
  return { year: reiwaToGregorianYear(Number(m[1])), month, third };
}

export function parseSyuyoCsv(bytes: ArrayBuffer | Uint8Array): ParsedSyuyoCsv {
  const decoder = new TextDecoder("shift_jis");
  const text = decoder.decode(bytes);
  const lines = text.split(/\r\n|\r|\n/);

  let period: Period | null = null;
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (period == null) {
      const p = parseReiwaPeriod(lines[i]);
      if (p) period = p;
    }
    if (lines[i].trim().startsWith(HEADER_MARKER)) {
      headerIndex = i;
      break;
    }
  }

  const items: SyuyoItem[] = [];
  if (headerIndex >= 0) {
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      const cells = line.split(",").map((c) => c.trim());
      if (cells.length < 9 || !cells[0]) continue;

      const itemName = cells[0];
      items.push({
        itemCode: cells[1],
        itemName,
        isBreakdownRow: itemName.startsWith("うち"),
        wholesaleQuantityTon: parseNumericJa(cells[2]),
        wholesaleValueThousandYen: parseNumericJa(cells[3]),
        pricePerKg: parseNumericJa(cells[4]),
        yoyQuantityPercent: parseNumericJa(cells[5]),
        yoyPricePercent: parseNumericJa(cells[6]),
        prevThirdQuantityPercent: parseNumericJa(cells[7]),
        prevThirdPricePercent: parseNumericJa(cells[8]),
      });
    }
  }

  return { period, items };
}
