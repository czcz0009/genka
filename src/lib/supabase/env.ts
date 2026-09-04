/**
 * Supabase接続情報が設定されているかどうかの判定。
 *
 * MVPの初期段階ではSupabaseプロジェクト未作成でも画面(特にCSV取り込みの
 * マッピング確認まで)を動作確認できるようにするため、未設定を例外ではなく
 * 「保存不可の状態」として扱えるようにする。
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
