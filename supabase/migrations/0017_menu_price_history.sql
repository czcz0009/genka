-- メニューの売価変更履歴。ingredient_price_history(食材の仕入単価履歴)と
-- 同じ考え方で、売価が変わるたびに1行記録する。
--
-- これは今回追加する仕組みのため、過去の値上げの記録は残っていない
-- (今後の変更分から溜まっていく)。「過去の値付け判断の成果追跡」機能
-- (menus/[id]画面)が、直近の売価変更の前後で利益を比較するために使う。

create table public.menu_price_history (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  price numeric not null check (price >= 0),
  recorded_at timestamptz not null default now()
);

create index menu_price_history_menu_id_idx on public.menu_price_history(menu_id, recorded_at desc);

alter table public.menu_price_history enable row level security;

create policy menu_price_history_owner_all on public.menu_price_history
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
