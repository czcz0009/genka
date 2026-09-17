-- 初回オンボーディングツアーの完了(またはスキップ)状態を保存する。
-- null = 未完了(まだメニューが0件なら自動表示の対象)。完了・スキップどちらの
-- 操作でもここに現在時刻を入れ、以後は自動表示しない。
--
-- 既存のget_or_create_store等のRPCの戻り値には含めない(列構成の変更は
-- DROP FUNCTIONが必要でリスクがあるため)。オンボーディング表示要否の判定は
-- storesテーブルへの直接クエリで行う。
alter table public.stores
  add column if not exists onboarding_completed_at timestamptz;
