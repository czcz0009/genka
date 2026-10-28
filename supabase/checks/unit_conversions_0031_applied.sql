-- マイグレーション0031(換算を覚える表・二度読みの記録)が正しく当たったかを、1回で確かめるSQL。読むだけで、何も変更しない。
-- SQL Editorで実行する。すべての列が true なら正常。

select
  exists (select 1 from public.migration_log where version = '0031') as "記録に0031がある",
  coalesce((select relrowsecurity from pg_class where oid = 'public.ingredient_unit_conversions'::regclass), false) as "換算の表_権限の決まりが有効",
  coalesce((select relrowsecurity from pg_class where oid = 'public.invoice_scan_records'::regclass), false) as "二度読みの記録_権限の決まりが有効",
  exists (select 1 from pg_constraint where conname = 'ingredient_unit_conversions_ingredient_unit_key') as "換算_食材と単位で1行の決まり",
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ingredient_unit_conversions') = 1 as "換算_決まりが1つ",
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoice_scan_records') = 2 as "二度読み_決まりが2つ(読む・足す)";
