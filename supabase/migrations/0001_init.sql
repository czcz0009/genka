-- 原価計算・メニュー値付けツール MVP 初期スキーマ
--
-- 設計方針:
-- - MVPは「1店舗1ユーザー」だが、店舗を最初からテーブル化しておくことで
--   将来の複数店舗対応の際にマイグレーションをやり直さずに済むようにする。
-- - 食材(ingredients)・メニュー(menus)は店舗内で正規化名が一意になるよう
--   UNIQUE制約を張る。これは「食材登録時にデータが重複する」という
--   類似アプリの既知バグを、アプリ側のロジックだけでなくDB制約でも防ぐため。
-- - RLS(Row Level Security)で「自分の店舗のデータしか読み書きできない」ことを
--   DB層で保証する。

create extension if not exists "pgcrypto"; -- gen_random_uuid() 用

-- ============================================================
-- stores: 店舗
-- ============================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  default_target_cost_rate numeric not null default 30 check (default_target_cost_rate > 0 and default_target_cost_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stores_owner_id_idx on public.stores(owner_id);

-- ============================================================
-- ingredients: 食材マスタ
-- ============================================================
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  -- アプリ側(src/lib/normalize.ts の normalizeForDedupe)で計算した正規化名。
  -- 表記ゆれのある重複登録を防ぐための一意キー。
  normalized_name text not null,
  unit text not null,
  current_purchase_price numeric not null default 0 check (current_purchase_price >= 0),
  price_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, normalized_name)
);

create index if not exists ingredients_store_id_idx on public.ingredients(store_id);

-- ============================================================
-- ingredient_price_history: 仕入単価の変更履歴
-- 「仕入れ値変動の検知」機能のため、単価を更新するたびに1行追加する想定。
-- ============================================================
create table if not exists public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  price numeric not null check (price >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists ingredient_price_history_ingredient_id_idx
  on public.ingredient_price_history(ingredient_id, recorded_at desc);

-- ============================================================
-- menus: メニュー(レシピ)
-- ============================================================
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  selling_price numeric check (selling_price is null or selling_price >= 0),
  -- null の場合は stores.default_target_cost_rate を使う
  target_cost_rate numeric check (target_cost_rate is null or (target_cost_rate > 0 and target_cost_rate <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, normalized_name)
);

create index if not exists menus_store_id_idx on public.menus(store_id);

-- ============================================================
-- menu_ingredients: メニューを構成する食材(レシピ明細)
-- ============================================================
create table if not exists public.menu_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  unique (menu_id, ingredient_id)
);

create index if not exists menu_ingredients_menu_id_idx on public.menu_ingredients(menu_id);
create index if not exists menu_ingredients_ingredient_id_idx on public.menu_ingredients(ingredient_id);

-- ============================================================
-- menu_sales: メニュー別の販売数量(利益貢献度ランキング機能用)
-- CSVインポートまたは手動入力を、期間単位の集計値として保存する。
-- ============================================================
create table if not exists public.menu_sales (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  quantity_sold integer not null check (quantity_sold >= 0),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists menu_sales_menu_id_idx on public.menu_sales(menu_id, period_start desc);

-- ============================================================
-- import_jobs: CSV/Excel取り込みの履歴(監査・やり直し用)
-- ============================================================
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  file_name text not null,
  -- ユーザーが確認・確定した最終マッピング({フィールドID: 列ヘッダー名})
  column_mapping jsonb not null,
  row_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists import_jobs_store_id_idx on public.import_jobs(store_id);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

drop trigger if exists ingredients_set_updated_at on public.ingredients;
create trigger ingredients_set_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();

drop trigger if exists menus_set_updated_at on public.menus;
create trigger menus_set_updated_at before update on public.menus
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security: 自分の店舗のデータのみアクセス可能にする
-- ============================================================
alter table public.stores enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_price_history enable row level security;
alter table public.menus enable row level security;
alter table public.menu_ingredients enable row level security;
alter table public.menu_sales enable row level security;
alter table public.import_jobs enable row level security;

create policy stores_owner_all on public.stores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy ingredients_owner_all on public.ingredients
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy ingredient_price_history_owner_all on public.ingredient_price_history
  for all using (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  );

create policy menus_owner_all on public.menus
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy menu_ingredients_owner_all on public.menu_ingredients
  for all using (
    exists (
      select 1 from public.menus m
      join public.stores s on s.id = m.store_id
      where m.id = menu_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.menus m
      join public.stores s on s.id = m.store_id
      where m.id = menu_id and s.owner_id = auth.uid()
    )
  );

create policy menu_sales_owner_all on public.menu_sales
  for all using (
    exists (
      select 1 from public.menus m
      join public.stores s on s.id = m.store_id
      where m.id = menu_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.menus m
      join public.stores s on s.id = m.store_id
      where m.id = menu_id and s.owner_id = auth.uid()
    )
  );

create policy import_jobs_owner_all on public.import_jobs
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );
