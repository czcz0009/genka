-- 0028を実行する前に、0001〜0027が適用されているかを確かめるSQL。読むだけで、何も変更しない。
-- 中身は 0028_migration_log.sql の確認部分と同じ(そこから取り出したもの)。すべて true なら0028を実行してよい。
-- false の番号があれば、0028は実行せずに止まって報告する(0028もエラーで止まり、何も記録しない)。

select version as "番号", name as "ファイル", ok as "適用を確認" from (values
 ('0001', '0001_init',
   to_regclass('public.stores') is not null and to_regclass('public.ingredients') is not null
   and to_regclass('public.ingredient_price_history') is not null and to_regclass('public.menus') is not null
   and to_regclass('public.menu_ingredients') is not null and to_regclass('public.menu_sales') is not null
   and to_regclass('public.import_jobs') is not null
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_updated_at')),
 ('0002', '0002_market_price_observations', to_regclass('public.market_price_observations') is not null),
 ('0003', '0003_ingredient_market_links', to_regclass('public.ingredient_market_links') is not null),
 ('0004', '0004_stores_owner_unique',
   exists(select 1 from pg_constraint where conrelid = to_regclass('public.stores') and conname = 'stores_owner_id_key')),
 ('0005', '0005_ranking_and_fl_ratio',
   to_regclass('public.store_fixed_costs') is not null
   and exists(select 1 from pg_constraint where conrelid = to_regclass('public.menu_sales') and conname = 'menu_sales_menu_period_key')),
 ('0006', '0006_livestock_price_observations', to_regclass('public.livestock_price_observations') is not null),
 ('0007', '0007_get_or_create_store_rpc',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_or_create_store')),
 ('0008', '0008_get_store_data_rpc',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data')),
 ('0009', '0009_get_ingredient_previous_prices_rpc',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_ingredient_previous_prices')),
 ('0010', '0010_store_ingredient_tax_mode',
   exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stores' and column_name = 'ingredient_price_tax_mode')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_or_create_store'
              and pg_get_function_result(oid) like '%ingredient_price_tax_mode%')),
 ('0011', '0011_get_store_data_tax_mode',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data'
          and prosrc like '%ingredient_price_tax_mode%')),
 ('0012', '0012_ingredient_yield_rate',
   exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredients' and column_name = 'yield_rate_percent')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data'
              and prosrc like '%yield_rate_percent%')),
 ('0013', '0013_ingredient_price_history_rpc',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_ingredient_price_history')),
 ('0014', '0014_loss_discount_fixed_cost',
   exists(select 1 from pg_constraint where conrelid = to_regclass('public.store_fixed_costs') and conname = 'store_fixed_costs_cost_type_check'
          and pg_get_constraintdef(oid) like '%loss%')),
 ('0015', '0015_onboarding_completed',
   exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stores' and column_name = 'onboarding_completed_at')),
 ('0016', '0016_prep_items',
   to_regclass('public.prep_item_components') is not null
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredients' and column_name = 'is_prep_item')
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredients' and column_name = 'yield_quantity')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data'
              and prosrc like '%is_prep_item%')),
 ('0017', '0017_menu_price_history', to_regclass('public.menu_price_history') is not null),
 ('0018', '0018_ocr_usage', to_regclass('public.ocr_usage') is not null),
 ('0019', '0019_ocr_attempt_limit',
   exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ocr_usage' and column_name = 'attempt_count')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'begin_ocr_attempt')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'complete_ocr_success')),
 ('0020', '0020_ingredient_price_is_set',
   exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredients' and column_name = 'price_is_set')
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredient_price_history' and column_name = 'price_is_set')),
 ('0021', '0021_expose_price_is_set',
   exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_ingredient_price_history'
          and pg_get_function_result(oid) like '%price_is_set%')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data'
              and prosrc like '%price_is_set%')),
 ('0022', '0022_prep_item_component_cascade',
   exists(select 1 from pg_constraint where conrelid = to_regclass('public.prep_item_components')
          and conname = 'prep_item_components_component_id_fkey' and confdeltype = 'c')),
 ('0023', '0023_account_deletion_requests', to_regclass('public.account_deletion_requests') is not null),
 ('0024', '0024_user_consents', to_regclass('public.user_consents') is not null),
 ('0025', '0025_categories',
   to_regclass('public.categories') is not null
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'menus' and column_name = 'category_id')
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ingredients' and column_name = 'category_id')
   and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stores' and column_name = 'categories_seeded_at')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_categories')
   and exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_store_data'
              and prosrc like '%category_id%')),
 ('0026', '0026_market_link_sources',
   exists(select 1 from pg_constraint where conrelid = to_regclass('public.ingredient_market_links')
          and conname = 'ingredient_market_links_source_check' and pg_get_constraintdef(oid) like '%excluded%')
   and exists(select 1 from pg_constraint where conrelid = to_regclass('public.ingredient_market_links')
              and conname = 'ingredient_market_links_item_code_by_source')
   and exists(select 1 from pg_constraint where conrelid = to_regclass('public.ingredient_market_links')
              and conname = 'ingredient_market_links_ingredient_id_key')),
 -- 0027は「古い決まりを消す」ので、0026が適用済みで、古い決まりが無いことで確かめる
 -- (0026は古い決まりが無ければ作り直すため、0026の後に無いのは0027を実行したときだけ)
 ('0027', '0027_drop_old_market_link_unique',
   exists(select 1 from pg_constraint where conrelid = to_regclass('public.ingredient_market_links')
          and conname = 'ingredient_market_links_ingredient_id_key')
   and not exists(select 1 from pg_constraint where conrelid = to_regclass('public.ingredient_market_links')
                  and conname = 'ingredient_market_links_ingredient_id_source_key'))
) as t(version, name, ok)
order by version;
