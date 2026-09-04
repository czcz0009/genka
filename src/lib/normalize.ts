/**
 * 文字列正規化ユーティリティ。
 *
 * 食材名・メニュー名の「表記ゆれによる重複登録」を防ぐための正規化ロジック。
 * 例: "小麦粉" と "小麦粉 " と "ｺﾑｷﾞ粉"(半角) と "小麦粉(強力粉)" のようなブレを
 * できるだけ同一とみなせるように緩めに正規化する。
 *
 * 注意: この正規化名は「同一食材候補の検出」に使うものであり、表示名(name)は
 * ユーザー入力をそのまま保持する。
 */

/** 全角/半角・大文字小文字・空白・記号のゆれを吸収した比較用キーを作る */
export function normalizeForDedupe(raw: string): string {
  return raw
    .normalize("NFKC") // 全角英数字/記号 -> 半角、半角カナ -> 全角カナ 等
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "") // 半角・全角スペースを除去
    .replace(/[・･,、。.]/g, "") // よくある区切り記号を除去
    .replace(/[()（）\[\]【】]/g, ""); // 括弧を除去(「小麦粉(強力粉)」のような注記を吸収)
}

/** 表示用に軽くトリムだけした名前(登録時に保存する name 用) */
export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/[\s　]+/g, " ");
}
