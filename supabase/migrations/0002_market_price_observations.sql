-- 農水省「青果物卸売市場調査(旬別結果)・主要卸売市場計」の取得結果を保存するテーブル。
--
-- 設計方針:
-- - これは店舗ごとのデータではなく、全店舗が参照する公開の市場参考データなので、
--   store_id を持たず、他のテーブルのような store 単位のRLSは適用しない
--   (読み取りは認証済みユーザーなら誰でも可能。書き込みはバッチ処理からのみ)。
-- - 品目コード(item_code)は農水省CSVの「品目コード」列をそのまま使う
--   (src/lib/marketPrices/parseSyuyoCsv.ts の itemCode に対応)。
-- - 同じ(品目, 対象期間)は一意。旬ごとに1回だけ取得・保存する想定。

create table if not exists public.market_price_observations (
  id uuid primary key default gen_random_uuid(),
  item_code text not null,
  item_name text not null,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  -- 1=上旬 2=中旬 3=下旬
  period_third smallint not null check (period_third between 1 and 3),
  wholesale_quantity_ton numeric,
  wholesale_value_thousand_yen numeric,
  price_per_kg numeric,
  yoy_quantity_percent numeric,
  yoy_price_percent numeric,
  prev_third_quantity_percent numeric,
  prev_third_price_percent numeric,
  fetched_at timestamptz not null default now(),
  unique (item_code, period_year, period_month, period_third)
);

create index if not exists market_price_observations_item_period_idx
  on public.market_price_observations(item_code, period_year, period_month, period_third);

alter table public.market_price_observations enable row level security;

-- 読み取りは認証済みユーザー全員に許可(店舗を問わない公開参考データのため)
create policy market_price_observations_read_all on public.market_price_observations
  for select using (auth.role() = 'authenticated');

-- 書き込みはバックエンドのバッチ処理(service role)からのみ行う想定のため、
-- 通常ユーザー向けの insert/update/delete ポリシーはあえて用意しない。
