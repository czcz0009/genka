-- ③メニュー別収益貢献度ランキング・FL比率/FLR比率アラート のためのスキーマ追加。

-- ============================================================
-- menu_sales: 同一メニュー・同一期間の再取り込み(CSV再アップロードや手動修正)で
-- 重複行が積み上がらないよう、upsert可能にするための一意制約を追加する。
-- ============================================================
alter table public.menu_sales
  add constraint menu_sales_menu_period_key unique (menu_id, period_start, period_end);

-- ============================================================
-- store_fixed_costs: FL比率・FLR比率の算出に使う固定費(家賃・人件費)。
--
-- - labor(人件費): 月ごとに変動するため、月次で period_start=月初/period_end=月末を
--   指定して都度入力する運用(MVPは手動入力のみ)。
-- - rent(家賃): 月額固定で、値が変わらない限り登録し直す必要がないよう
--   period_end を null(継続中)にできるようにしている。家賃が変わったら
--   古い行の period_end を締めて、新しい行を period_start から追加する想定。
-- ============================================================
create table if not exists public.store_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cost_type text not null check (cost_type in ('rent', 'labor')),
  amount numeric not null check (amount >= 0),
  period_start date not null,
  -- null = 現在も継続中(主に家賃)。人件費は月ごとに必ず指定する運用。
  period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_end >= period_start),
  unique (store_id, cost_type, period_start)
);

create index if not exists store_fixed_costs_store_id_idx
  on public.store_fixed_costs(store_id, cost_type, period_start desc);

drop trigger if exists store_fixed_costs_set_updated_at on public.store_fixed_costs;
create trigger store_fixed_costs_set_updated_at before update on public.store_fixed_costs
  for each row execute function public.set_updated_at();

alter table public.store_fixed_costs enable row level security;

create policy store_fixed_costs_owner_all on public.store_fixed_costs
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );
