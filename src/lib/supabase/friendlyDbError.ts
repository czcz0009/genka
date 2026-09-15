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
  return error?.message ?? "不明なエラー";
}
