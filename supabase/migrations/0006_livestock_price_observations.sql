-- 農水省「畜産物卸売価格の推移(月報告)」の取得結果を保存するテーブル。
-- market_price_observations(青果物・旬別)と同じ設計方針:
-- - 店舗非依存の公開参考データ。読み取りは認証済みユーザー全員に許可。
-- - 書き込みはservice role(定期取得バッチ)からのみ。通常ユーザー向けの
--   insert/update/deleteポリシーはあえて用意しない。
-- - 青果物は「旬」だが畜産物は「月」単位のため、別テーブルにしている
--   (period_third の概念がなく、無理に同じテーブルに寄せると
--   check制約が意味をなさなくなるため)。

create table if not exists public.livestock_price_observations (
  id uuid primary key default gen_random_uuid(),
  -- src/lib/marketPrices/livestock/chikusanColumns.ts の ChikusanItemCode に対応
  item_code text not null,
  item_name text not null,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  price_per_kg numeric,
  fetched_at timestamptz not null default now(),
  unique (item_code, period_year, period_month)
);

create index if not exists livestock_price_observations_item_period_idx
  on public.livestock_price_observations(item_code, period_year, period_month);

alter table public.livestock_price_observations enable row level security;

create policy livestock_price_observations_read_all on public.livestock_price_observations
  for select using (auth.role() = 'authenticated');
