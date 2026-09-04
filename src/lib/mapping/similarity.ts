/**
 * 文字列類似度(Dice係数 / bigram)。
 *
 * 日本語は単語分かち書きがないため、形態素解析なしでも実用的な
 * bigram(2文字組)ベースの類似度を使う。1文字の語は文字集合の
 * Jaccard係数にフォールバックする。
 */

function normalizeForCompare(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[()（）\[\]【】]/g, "");
}

function bigrams(s: string): string[] {
  if (s.length < 2) return s.length === 1 ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 0(無関係) 〜 1(完全一致) を返す類似度スコア */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;

  const bgA = bigrams(na);
  const bgB = bigrams(nb);
  if (bgA.length === 0 || bgB.length === 0) {
    // 1文字同士: 完全一致以外は無関係として扱う
    return 0;
  }

  const counts = new Map<string, number>();
  for (const bg of bgB) counts.set(bg, (counts.get(bg) ?? 0) + 1);
  let matches = 0;
  for (const bg of bgA) {
    const c = counts.get(bg);
    if (c && c > 0) {
      matches++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * matches) / (bgA.length + bgB.length);
}

/**
 * 一方が他方を包含している場合の追加ボーナス込みスコア(「食材名」⊂「食材名(税抜)」等)。
 *
 * 包含ボーナスは短い側の文字列が2文字以上のときだけ与える。1文字(例:「量」
 * 「額」)は日本語では極めて多義的で、「重量」「残量」「熱量」のように無関係な
 * 語にも含まれてしまい、内容が数値っぽいだけの列を高確信度で誤マッピングする
 * 原因になり得るため。
 */
export function headerMatchScore(header: string, synonym: string): number {
  const base = stringSimilarity(header, synonym);
  const nh = normalizeForCompare(header);
  const ns = normalizeForCompare(synonym);
  const shorterLength = Math.min(nh.length, ns.length);
  if (shorterLength >= 2 && (nh.includes(ns) || ns.includes(nh))) {
    return Math.max(base, 0.85);
  }
  return base;
}
