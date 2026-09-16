/**
 * DBエラーを、ユーザー向けの分かりやすい日本語メッセージに変換する。
 *
 * 背景(配布前QAで発見): 食材名・メニュー名の重複は事前にSELECTで確認してから
 * INSERT/UPDATEしているが、これはTOCTOU(確認してから実行するまでの間に別の
 * リクエストが割り込む)構造になっている。複数タブ・複数端末からほぼ同時に
 * 同じ名前を登録しようとした場合、事前チェックはすり抜けてしまうことがあるが、
 * DBのユニーク制約(unique(store_id, normalized_name))が最終防衛ラインとして
 * 必ず弾いてくれる(重複データが実際に作られることはない)。
 * ただし、その際のエラーはPostgresの生のメッセージ
 * (例: "duplicate key value violates unique constraint ..."）になってしまい、
 * ユーザーには意味が分からないため、事前チェックと同じ日本語メッセージに変換する。
 */
export function friendlyDbError(
  error: { code?: string; message: string } | null | undefined,
  duplicateMessage: string,
): string {
  if (error?.code === "23505") return duplicateMessage;
  if (error) console.error("[db error]", error);
  return "処理に失敗しました。時間をおいて再度お試しください。";
}

/**
 * DBエラーをそのままユーザーに見せず、サーバーログにだけ詳細を残す。
 *
 * 背景(セキュリティ監査で発見): 「確認に失敗しました: ${error.message}」のように
 * Postgresの生のエラーメッセージ(テーブル名・制約名等の内部情報を含みうる)を
 * そのまま画面に表示していた箇所が複数あった。ユーザー向けには操作名だけを含む
 * 定型文を返し、詳細はサーバーコンソール(Vercelのログ)にのみ出力する。
 */
export function dbErrorMessage(action: string, error: unknown): string {
  console.error(`[db error] ${action}`, error);
  return `${action}に失敗しました。時間をおいて再度お試しください。`;
}
