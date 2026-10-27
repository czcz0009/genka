-- マイグレーション0029(読み取りの回数の上限の見直し)を当てた後の確認。読むだけで、何も変更しない。
-- すべて true なら適用済み。
select '表 ocr_usage_monthly' as "確認", to_regclass('public.ocr_usage_monthly') is not null as "結果"
union all select '表 ocr_usage_daily_total', to_regclass('public.ocr_usage_daily_total') is not null
union all select '表 ocr_attempt_reservations', to_regclass('public.ocr_attempt_reservations') is not null
union all select '表 ocr_service_incidents', to_regclass('public.ocr_service_incidents') is not null
union all select '関数 begin_ocr_attempt_v2', exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'begin_ocr_attempt_v2')
union all select '関数 complete_ocr_success_v2', exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'complete_ocr_success_v2')
union all select '関数 cancel_ocr_attempt_v2', exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'cancel_ocr_attempt_v2')
union all select '今の本番の関数 begin_ocr_attempt(残っている)', exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'begin_ocr_attempt')
union all select 'RLS(4つの表)', (select bool_and(relrowsecurity) from pg_class where oid in ('public.ocr_usage_monthly'::regclass, 'public.ocr_usage_daily_total'::regclass, 'public.ocr_attempt_reservations'::regclass, 'public.ocr_service_incidents'::regclass))
union all select 'migration_log に0029', exists(select 1 from public.migration_log where version = '0029');
