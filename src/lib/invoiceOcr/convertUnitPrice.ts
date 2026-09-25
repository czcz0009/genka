/**
 * 納品書の単位と、登録済み食材の単位が違うときに、単価を換算する。
 * 換算できるのは「重さ(g・kg)」同士と「容量(ml・L)」同士だけ。
 * 「個」と「kg」のように換算の根拠がないものは null を返す(勝手に推測しない)。
 */

type Dimension = "weight" | "volume";

/** 基準単位(重さ=g、容量=ml)に対する倍率 */
const UNIT_TABLE = new Map<string, { dimension: Dimension; toBase: number }>(Object.entries({
  g: { dimension: "weight", toBase: 1 },
  グラム: { dimension: "weight", toBase: 1 },
  kg: { dimension: "weight", toBase: 1000 },
  キロ: { dimension: "weight", toBase: 1000 },
  キログラム: { dimension: "weight", toBase: 1000 },
  ml: { dimension: "volume", toBase: 1 },
  cc: { dimension: "volume", toBase: 1 },
  ミリリットル: { dimension: "volume", toBase: 1 },
  l: { dimension: "volume", toBase: 1000 },
  リットル: { dimension: "volume", toBase: 1000 },
} as Record<string, { dimension: Dimension; toBase: number }>));

function normalizeUnit(unit: string): string {
  return unit.normalize("NFKC").trim().toLowerCase();
}

/** 同じ単位とみなせるか(表記ゆれ込み) */
export function isSameUnit(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

/**
 * @param price 納品書の単位あたりの単価
 * @returns 登録済み食材の単位あたりの単価。換算できない場合は null
 */
export function convertUnitPrice(price: number, fromUnit: string, toUnit: string): number | null {
  if (isSameUnit(fromUnit, toUnit)) return price;
  const from = UNIT_TABLE.get(normalizeUnit(fromUnit));
  const to = UNIT_TABLE.get(normalizeUnit(toUnit));
  if (!from || !to || from.dimension !== to.dimension) return null;
  return price * (to.toBase / from.toBase);
}
