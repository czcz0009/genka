/**
 * CSV/Excelの列ヘッダーから、対象フィールド(メニュー名・食材名・分量・単位・
 * 仕入単価・売価)へのマッピング候補を推測する。
 *
 * 方針:
 * 1. ヘッダー文字列の類似度(表記ゆれ吸収)で候補スコアを出す
 * 2. セルの実データ(数値っぽいか、単位っぽいか)で補正する
 * 3. 列とフィールドは1対1になるよう貪欲法で割り当てる
 * 4. スコアが低い場合は「未割り当て」のままにし、必ず人間が確認・修正する前提とする
 *    (このツールはマッピングを自動確定しない)
 */
import { FIELD_DEFS, KNOWN_UNITS } from "./fields.ts";
import type { FieldDef, FieldId } from "./fields.ts";
import { headerMatchScore } from "./similarity.ts";
import { numericFraction } from "./numeric.ts";

export type ConfidenceLevel = "high" | "medium" | "none";

export interface ColumnCandidate {
  header: string;
  columnIndex: number;
  score: number;
}

export interface MappingSuggestion<TId extends string = FieldId> {
  fieldId: TId;
  label: string;
  required: boolean;
  /** 推測された割り当て先ヘッダー。null なら未割り当て(ユーザー選択待ち)。 */
  header: string | null;
  columnIndex: number | null;
  confidence: number;
  level: ConfidenceLevel;
  /** スコア上位の候補(ドロップダウンの並び替えやデバッグ用) */
  candidates: ColumnCandidate[];
}

const NAME_WEIGHT = 0.7;
const CONTENT_WEIGHT = 0.3;

/**
 * このスコア未満は「推測なし」として未割り当てのままにし、必ずユーザーに
 * 手動選択させる(自動では選ばない)。
 *
 * 0.5に設定しているのは、CONTENT_WEIGHT(セル内容による補正)の上限が0.3で
 * あるため、「列ヘッダーの名前が同義語と一切似ていない(nameScore=0)」列は
 * 内容がどれだけ数値/単位らしくても 0.3 にしかならず、この閾値を超えられない
 * ようにするため。つまり「名前の手がかりが全くない列を、内容だけで
 * 数量や単価だと決めつけて事前選択する」ことが構造的に起きない。
 * 逆に、名前がそれなりに一致していても(nameScore <= 0.5程度)内容と合わせて
 * 五分五分未満の確信度なら、店主が気づかないまま原価計算が狂う方が
 * 「もう一手間ドロップダウンで選ばせる」より悪いと判断し、あえて厳しめにしている。
 * (経験的なデータで統計的にチューニングした値ではなく、上記の構造的な安全側
 * マージンを根拠に選んだデフォルト値。実データが集まれば見直す)
 */
const AUTO_ASSIGN_MIN_SCORE = 0.5;

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.75) return "high";
  if (score >= AUTO_ASSIGN_MIN_SCORE) return "medium";
  return "none";
}

function unitFraction(values: string[]): number {
  const nonEmpty = values.map((v) => v?.trim()).filter((v): v is string => !!v);
  if (nonEmpty.length === 0) return 0;
  const hit = nonEmpty.filter((v) => KNOWN_UNITS.has(v)).length;
  return hit / nonEmpty.length;
}

function nameScoreFor(header: string, synonyms: string[]): number {
  let best = 0;
  for (const syn of synonyms) {
    const s = headerMatchScore(header, syn);
    if (s > best) best = s;
  }
  return best;
}

function contentScoreFor(kind: FieldDef["kind"], values: string[]): number {
  if (kind === "numeric") return numericFraction(values);
  if (kind === "unit") return unitFraction(values);
  // text: 数値っぽい列は文字列フィールドらしくないので減点
  return 1 - numericFraction(values);
}

/**
 * @param headers CSV/Excelの1行目(列ヘッダー)
 * @param sampleRows ヘッダーを除いたデータ行(先頭数十行で十分)。各行は headers と同じ列数の文字列配列。
 * @param fieldDefs マッピング対象フィールドの定義。省略時は①のレシピ取り込み用(FIELD_DEFS)。
 *   ③の販売数量CSVなど、別のフィールド構成にも同じロジックを使い回せる。
 */
export function suggestColumnMapping<TId extends string = FieldId>(
  headers: string[],
  sampleRows: string[][],
  fieldDefs: FieldDef<TId>[] = FIELD_DEFS as unknown as FieldDef<TId>[],
): MappingSuggestion<TId>[] {
  const columnValues: string[][] = headers.map((_, colIdx) =>
    sampleRows.map((row) => row[colIdx] ?? ""),
  );

  // 全フィールド × 全列のスコア表を作る
  const scoreTable: { fieldId: TId; columnIndex: number; score: number }[] = [];
  const candidatesByField = new Map<TId, ColumnCandidate[]>();

  for (const field of fieldDefs) {
    const candidates: ColumnCandidate[] = headers.map((header, columnIndex) => {
      const nameScore = nameScoreFor(header, field.synonyms);
      const contentScore = contentScoreFor(field.kind, columnValues[columnIndex]);
      const score = NAME_WEIGHT * nameScore + CONTENT_WEIGHT * contentScore;
      return { header, columnIndex, score };
    });
    candidates.sort((a, b) => b.score - a.score);
    candidatesByField.set(field.id, candidates);
    for (const c of candidates) {
      scoreTable.push({ fieldId: field.id, columnIndex: c.columnIndex, score: c.score });
    }
  }

  // 貪欲法: スコアの高い(フィールド, 列)組み合わせから確定させ、
  // 使用済みのフィールド・列は以降の割り当てから除外する
  scoreTable.sort((a, b) => b.score - a.score);
  const assignedField = new Map<TId, { columnIndex: number; score: number }>();
  const usedColumns = new Set<number>();

  for (const entry of scoreTable) {
    if (entry.score < AUTO_ASSIGN_MIN_SCORE) break; // 以降はもっと低いスコアしかない
    if (assignedField.has(entry.fieldId)) continue;
    if (usedColumns.has(entry.columnIndex)) continue;
    assignedField.set(entry.fieldId, { columnIndex: entry.columnIndex, score: entry.score });
    usedColumns.add(entry.columnIndex);
  }

  return fieldDefs.map((field) => {
    const assigned = assignedField.get(field.id);
    const candidates = candidatesByField.get(field.id) ?? [];
    return {
      fieldId: field.id,
      label: field.label,
      required: field.required,
      header: assigned ? headers[assigned.columnIndex] : null,
      columnIndex: assigned ? assigned.columnIndex : null,
      confidence: assigned ? assigned.score : 0,
      level: assigned ? confidenceLevel(assigned.score) : "none",
      candidates,
    };
  });
}
