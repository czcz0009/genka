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

/**
 * 食材名・メニュー名の文字数上限。
 *
 * 配布前QAで発見: 以前は上限が無く、極端に長い名前(例: 500文字)を登録すると
 * 一覧画面のレイアウトが崩れる懸念があった。実用上の食材名・メニュー名は
 * 数文字〜数十文字程度のため、100文字あれば十分に余裕がある上限として設定する。
 */
export const MAX_NAME_LENGTH = 100;

/** 名前の文字数チェック。問題なければnull、上限超過ならエラーメッセージを返す。 */
export function validateNameLength(trimmedName: string, label: string): string | null {
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return `${label}は${MAX_NAME_LENGTH}文字以内で入力してください`;
  }
  return null;
}
