-- マイグレーションの記録(public.migration_log)の状況を1回で確かめるSQL。読むだけで、何も変更しない。
-- 0028を適用した後に使える。SQL Editorで実行する。
--
-- 「抜けている番号」は、0001から「記録されている最大の番号」までのうち、記録の無い番号(番号の範囲は固定しない)。
-- 見方: 「記録されている最新」がリポジトリの supabase/migrations/ の最新の番号と同じで、「抜けている番号」が
-- 「なし」なら、すべて適用済み。
-- 注意: 記録を書き忘れたマイグレーションは、実行していても「抜け」に見える。

select
  max(version) as "記録されている最新",
  count(*) as "記録の件数",
  coalesce(
    (select string_agg(lpad(n::text, 4, '0'), ', ' order by n)
     from generate_series(1, (select max(version)::int from public.migration_log)) as n
     where lpad(n::text, 4, '0') not in (select version from public.migration_log)),
    'なし'
  ) as "抜けている番号",
  max(recorded_at) as "最後に記録した日時"
from public.migration_log;
