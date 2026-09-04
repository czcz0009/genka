/**
 * 農水省「畜産物卸売価格の推移(月報告)」PDFのパーサ。
 *
 * 実データ(index-594.pdf, 令和8年8月分)を取得して確認した結果:
 * - システムの pdftotext(poppler)は日本語(漢字・かな)を一切抽出できなかった
 *   (CJK用CMapデータ不足と思われる)。pdfjs-dist を使うと正しく抽出できる。
 * - 数値セルは列ごとに右揃えで配置されている。桁数が変わると左端(x)は
 *   ズレるが、右端(x+width)は同じ列なら月内のどの行・どの旬でもほぼ完全に
 *   一致することを実データで確認した(誤差0.1pt未満)。そのため列の検出には
 *   左端ではなく右端をクラスタリングの基準にしている。
 * - 見出しは4段に重なった結合見出しで、しかも一部のラベル(「成牛」等)は
 *   幾何情報だけでは対応する列を一意に決められない(隣の列のラベルの方が
 *   位置的に近く見えてしまう)ことを確認した。列の意味自体は月ごとに
 *   変わらない固定フォーマットである前提を置き、見出しテキストの自動再構成は
 *   行わず、位置から求めた列インデックスを chikusanColumns.ts の固定カタログに
 *   突き合わせる設計にしている(列数が想定(11列)と一致するかは検証し、
 *   一致しなければ「レイアウトが変わった」ものとしてエラーを返す)。
 * - pdfjs-distは内部で `await import(workerSrc)` によりworkerを動的に読み込むが、
 *   Next.jsのバンドラ(Turbopack)はwebpack向けの `webpackIgnore` コメントを無視して
 *   この動的importまで書き換えてしまい、Route Handlerから呼ぶと解決に失敗することを
 *   実際に確認した(単体のNodeスクリプトでは問題なく動いていた)。pdfjs-dist自身が
 *   バンドラ環境向けに用意している回避策 — worker本体を自分で静的importして
 *   `globalThis.pdfjsWorker` に登録しておく(pdf.mjs内の
 *   `#mainThreadWorkerMessageHandler` が最優先でこれを見に行く実装になっている) —
 *   を使うことで、動的importを一切経由せずに済むようにしている。
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "./chikusanColumns.ts";

const require = createRequire(import.meta.url);

export type ChikusanRowKind = "monthly" | "third" | "daily";

export interface ChikusanRow {
  kind: ChikusanRowKind;
  /** 行ラベル(例:「8年7月」「上旬」「3日」) */
  rowLabel: string;
  /** 日別行のみ: 曜日(例:「月」) */
  weekday: string | null;
  /** 品目コード -> 値(円/kg)。頭数など価格でない列は含まない。 */
  prices: Partial<Record<ChikusanItemCode, number | null>>;
}

export type ParseChikusanPdfResult =
  | { status: "ok"; title: string | null; rows: ChikusanRow[] }
  | {
      status: "unexpected_layout";
      detail: string;
      /** デバッグ用に、検出できた生の列数・行数だけは返す */
      detectedColumnCount: number;
      detectedRowCount: number;
    };

interface PositionedItem {
  x: number;
  y: number;
  width: number;
  str: string;
}

/**
 * pdfjs-distはNodeのBuffer(Uint8Arrayのサブクラス)を受け付けず、
 * 素のUint8Arrayであることを厳密にチェックしている。
 * fs.readFileSyncの戻り値(Buffer)をそのまま渡せるようにするための変換。
 *
 * 必ずコピーを返す(元のバッファをそのまま参照する view にしない): pdfjs-dist は
 * 内部で渡されたバッファの所有権を持って行く(detach/transferする)ことがあり、
 * 同じ入力データを使い回して複数回パースする(テストで同一フィクスチャを
 * 使い回す等)と2回目以降に空データになる不具合を実際に確認したため。
 */
function toPlainUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function pdfAssetDir(sub: string): string {
  const pkgJsonPath = require.resolve("pdfjs-dist/package.json");
  return join(dirname(pkgJsonPath), sub) + "/";
}

/** 近い値をグループ化する(表のわずかなガタつきを吸収する)。クラスタ平均のソート済み配列を返す。 */
function clusterValues(values: number[], epsilon: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const v of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && v - last[last.length - 1] <= epsilon) {
      last.push(v);
    } else {
      clusters.push([v]);
    }
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

function nearestIndex(target: number, candidates: number[]): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  candidates.forEach((c, i) => {
    const d = Math.abs(c - target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return bestIdx;
}

const MONTHLY_LABEL = /^\d+年\s*\d+月$/;
// 「上旬」「中旬」「下旬」は「上」と「旬」が別々のテキスト要素として並ぶことがある
const THIRD_FIRST_TOKEN = /^(上|中|下)$/;
const THIRD_LABEL = /^(上|中|下)\s*旬$/;
const DAILY_LABEL = /^(\d{1,2})日$/;
const WEEKDAY_LABEL = /^[（(]([月火水木金土日])[)）]$/;

function toNumberOrNull(raw: string): number | null {
  const cleaned = raw.replace(/[,，]/g, "").trim();
  if (cleaned === "-" || cleaned === "－" || cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** ExpectedColumnCount と実際に検出した列数が違えばエラーにする(レイアウト変化を静かに無視しない) */
const EXPECTED_COLUMN_COUNT = CHIKUSAN_COLUMNS.length;

export async function parseChikusanPdf(bytes: ArrayBuffer | Uint8Array): Promise<ParseChikusanPdfResult> {
  // legacyビルドを使う(Node環境向け。DOM依存のwebビルドは使えない)
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // ファイル先頭コメントの通り、動的importを経由させないための登録
  (globalThis as { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data: toPlainUint8Array(bytes),
      cMapUrl: pdfAssetDir("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: pdfAssetDir("standard_fonts"),
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    return {
      status: "unexpected_layout",
      detail: `PDFとして読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`,
      detectedColumnCount: 0,
      detectedRowCount: 0,
    };
  }

  const allItems: PositionedItem[] = [];
  let title: string | null = null;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      const item = raw as { str: string; transform: number[]; width: number };
      const str = item.str.trim();
      if (!str) continue;
      if (title == null) title = str; // ページ最初の非空テキストがタイトル行
      allItems.push({ x: item.transform[4], y: item.transform[5] + p * 100000, width: item.width, str });
    }
  }

  // 行方向(y)のクラスタリング(同じ行内の微小なずれを吸収)
  const rowYs = clusterValues(Array.from(new Set(allItems.map((i) => i.y))), 1.5);
  const rowsByY = new Map<number, PositionedItem[]>();
  for (const item of allItems) {
    const key = rowYs[nearestIndex(item.y, rowYs)];
    const list = rowsByY.get(key) ?? [];
    list.push(item);
    rowsByY.set(key, list);
  }

  // データ行(行ラベルが 月別/旬別/日別のパターンに一致する行)を特定する
  type RawDataRow = {
    kind: ChikusanRowKind;
    rowLabel: string;
    weekday: string | null;
    items: PositionedItem[];
  };
  const dataRows: RawDataRow[] = [];
  for (const y of Array.from(rowsByY.keys()).sort((a, b) => b - a)) {
    const items = rowsByY.get(y)!.sort((a, b) => a.x - b.x);
    const first = items[0];
    if (!first) continue;

    if (MONTHLY_LABEL.test(first.str)) {
      dataRows.push({ kind: "monthly", rowLabel: first.str, weekday: null, items: items.slice(1) });
    } else if (THIRD_LABEL.test(first.str.replace(/\s+/g, ""))) {
      // 「上旬」のように1要素で完結しているケース
      dataRows.push({
        kind: "third",
        rowLabel: first.str.replace(/\s+/g, ""),
        weekday: null,
        items: items.slice(1),
      });
    } else if (THIRD_FIRST_TOKEN.test(first.str) && items[1] && items[1].str === "旬") {
      // 「上」「旬」のように2要素に分かれているケース
      dataRows.push({
        kind: "third",
        rowLabel: `${first.str}旬`,
        weekday: null,
        items: items.slice(2),
      });
    } else if (DAILY_LABEL.test(first.str)) {
      const second = items[1];
      const hasWeekday = Boolean(second && WEEKDAY_LABEL.test(second.str));
      dataRows.push({
        kind: "daily",
        rowLabel: first.str,
        weekday: hasWeekday ? second.str.replace(/[（()）]/g, "") : null,
        items: items.slice(hasWeekday ? 2 : 1),
      });
    }
  }

  if (dataRows.length === 0) {
    return {
      status: "unexpected_layout",
      detail: "月別・旬別・日別のいずれの行ラベルも見つかりませんでした",
      detectedColumnCount: 0,
      detectedRowCount: 0,
    };
  }

  // 列の右端(x+width)は同一列なら桁数が変わってもほぼ一致するため、これをクラスタリングの基準にする。
  // 「-」(欠測値)のグリフ幅は数字と若干違うため数pt程度ずれることがあり、実データで確認した
  // 列間の最小間隔(約30pt)より十分小さいepsilon=6でそのガタつきを吸収する。
  const rightEdges = dataRows.flatMap((r) => r.items.map((i) => i.x + i.width));
  const columnRightEdges = clusterValues(rightEdges, 6);

  if (columnRightEdges.length !== EXPECTED_COLUMN_COUNT) {
    return {
      status: "unexpected_layout",
      detail: `検出した列数(${columnRightEdges.length})が想定(${EXPECTED_COLUMN_COUNT})と一致しません。レイアウトが変わった可能性があります。`,
      detectedColumnCount: columnRightEdges.length,
      detectedRowCount: dataRows.length,
    };
  }

  const rows: ChikusanRow[] = dataRows.map((r) => {
    const values: (number | null)[] = columnRightEdges.map(() => null);
    for (const item of r.items) {
      const idx = nearestIndex(item.x + item.width, columnRightEdges);
      values[idx] = toNumberOrNull(item.str);
    }
    const prices: Partial<Record<ChikusanItemCode, number | null>> = {};
    CHIKUSAN_COLUMNS.forEach((col) => {
      if (col.itemCode) prices[col.itemCode] = values[col.index];
    });
    return { kind: r.kind, rowLabel: r.rowLabel, weekday: r.weekday, prices };
  });

  return { status: "ok", title, rows };
}
