-- メニュー・食材のカテゴリ(タブ)分け。
--
-- 方針:
-- - categoriesテーブルを1つ用意し、kind('menu'/'ingredient')でメニュー用・食材用を区別する。
-- - menus・ingredientsにnullを許すcategory_idを追加する(null=未分類)。
--   カテゴリを削除したら、中の項目は未分類(null)に戻る(on delete set null)。
-- - 仕込み品にはカテゴリを付けない(食材一覧の固定の「仕込み品」タブで別枠表示する)。
--   DBでは禁止せず、アプリ側で選べないようにする。
-- - デフォルトカテゴリは、店舗の作成時にトリガーで自動作成する。ただしカテゴリ作成の
--   失敗で店舗の作成(初回ログイン)を止めないよう、例外は握りつぶして警告ログだけ残す。
--   作成できたかは stores.categories_seeded_at で記録し、null のままの店舗は
--   get_categories() の呼び出し時に自動で補う(後から補える仕組み)。
-- - 原価計算・FL比率等の計算ロジックはcategory_idを一切使わない(数字は変わらない)。
--
-- 元に戻したい場合は rollback_0025_categories.sql を実行すること。

begin;

-- ============================================================
-- categories: カテゴリ
-- ============================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in ('menu', 'ingredient')),
  name text not null,
  -- アプリ側(src/lib/normalize.ts の normalizeForDedupe)で計算した正規化名。
  -- 「ご飯・麺類」と「ご飯麺類」のような表記ゆれの重複作成を防ぐための一意キー
  -- (menus・ingredientsと同じ方式)。
  normalized_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, kind, normalized_name)
);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

create policy categories_owner_all on public.categories
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

-- ============================================================
-- menus・ingredientsにcategory_idを追加(既存の行はすべてnull=未分類から始まる)
-- ============================================================
alter table public.menus
  add column category_id uuid references public.categories(id) on delete set null;
alter table public.ingredients
  add column category_id uuid references public.categories(id) on delete set null;

create index menus_category_id_idx on public.menus(category_id);
create index ingredients_category_id_idx on public.ingredients(category_id);

-- デフォルトカテゴリを作成済みかどうか(null=未作成。作成に失敗した店舗の補完に使う)。
alter table public.stores
  add column categories_seeded_at timestamptz;

-- ============================================================
-- デフォルトカテゴリの作成関数
-- ============================================================
-- normalized_nameは normalizeForDedupe() の結果と一致している必要がある
-- (src/lib/defaultCategories.test.ts で、このファイルの値を読み取って照合している)。
-- 既に同じ名前があれば何もしない(on conflict do nothing)ので、何度呼んでも安全。
create or replace function public.seed_default_categories(p_store_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.categories (store_id, kind, name, normalized_name, sort_order)
  values
    (p_store_id, 'menu', '前菜・一品', '前菜一品', 1),
    (p_store_id, 'menu', 'メイン', 'メイン', 2),
    (p_store_id, 'menu', 'ご飯・麺類', 'ご飯麺類', 3),
    (p_store_id, 'menu', 'サイド', 'サイド', 4),
    (p_store_id, 'menu', 'ドリンク', 'ドリンク', 5),
    (p_store_id, 'menu', 'デザート', 'デザート', 6),
    (p_store_id, 'ingredient', '野菜・果物', '野菜果物', 1),
    (p_store_id, 'ingredient', '肉', '肉', 2),
    (p_store_id, 'ingredient', '魚介', '魚介', 3),
    (p_store_id, 'ingredient', '卵・乳製品', '卵乳製品', 4),
    (p_store_id, 'ingredient', '米・麺・粉', '米麺粉', 5),
    (p_store_id, 'ingredient', '調味料・油', '調味料油', 6),
    (p_store_id, 'ingredient', '乾物・缶詰', '乾物缶詰', 7),
    (p_store_id, 'ingredient', '飲料・酒', '飲料酒', 8),
    (p_store_id, 'ingredient', 'その他', 'その他', 9)
  on conflict (store_id, kind, normalized_name) do nothing;

  update public.stores set categories_seeded_at = now() where id = p_store_id;
end;
$$;

grant execute on function public.seed_default_categories(uuid) to authenticated;

-- ============================================================
-- 店舗作成時にデフォルトカテゴリを自動作成するトリガー
-- ============================================================
-- get_or_create_store()は「insert ... on conflict (owner_id) do nothing」なので、
-- 既存店舗では行が追加されず、このトリガーは店舗の初回作成時だけ動く。
-- 例外は握りつぶす(begin〜exceptionの中で起きた変更だけが取り消され、店舗の作成は通る)。
-- 失敗した店舗はcategories_seeded_atがnullのまま残り、get_categories()で補われる。
create or replace function public.stores_seed_default_categories()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  begin
    perform public.seed_default_categories(new.id);
  exception when others then
    raise warning 'seed_default_categories failed for store %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists stores_seed_default_categories on public.stores;
create trigger stores_seed_default_categories after insert on public.stores
  for each row execute function public.stores_seed_default_categories();

-- ============================================================
-- 既存の店舗にもデフォルトカテゴリを作成する(未作成の店舗のみ)
-- ============================================================
select public.seed_default_categories(s.id)
from public.stores s
where s.categories_seeded_at is null;

-- ============================================================
-- get_categories: 自分の店舗のカテゴリ一覧を取得する(未作成なら先に補う)
-- ============================================================
-- メニュー一覧・食材一覧・編集画面から呼ぶ。categories_seeded_atがnull
-- (トリガーでの作成に失敗した店舗)なら、ここでデフォルトカテゴリを作成してから返す。
-- 補完に失敗しても例外は握りつぶし、その時点のカテゴリ(0件なら空)を返す
-- (カテゴリは任意機能のため、画面表示自体は止めない)。
create or replace function public.get_categories()
returns table (id uuid, kind text, name text, sort_order integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_store_id uuid;
  v_seeded_at timestamptz;
begin
  select s.id, s.categories_seeded_at
    into v_store_id, v_seeded_at
    from public.stores s
    where s.owner_id = auth.uid();

  if v_store_id is null then
    return;
  end if;

  if v_seeded_at is null then
    begin
      perform public.seed_default_categories(v_store_id);
    exception when others then
      raise warning 'seed_default_categories failed for store %: %', v_store_id, sqlerrm;
    end;
  end if;

  return query
    select c.id, c.kind, c.name, c.sort_order
    from public.categories c
    where c.store_id = v_store_id
    order by c.kind, c.sort_order, c.created_at;
end;
$$;

grant execute on function public.get_categories() to authenticated;

-- ============================================================
-- get_store_data: menusにcategory_idを追加する(0021版との差分はこの1項目のみ)
-- ============================================================
-- 戻り値の型(json)・引数は変えず、本体だけ差し替える。
create or replace function public.get_store_data(
  p_sales_from date default null,
  p_sales_to date default null
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_store record;
  result json;
begin
  select id, name, default_target_cost_rate, ingredient_price_tax_mode
    into v_store
    from public.stores
    where owner_id = auth.uid();

  if v_store.id is null then
    return null;
  end if;

  select json_build_object(
    'store', json_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'default_target_cost_rate', v_store.default_target_cost_rate,
      'ingredient_price_tax_mode', v_store.ingredient_price_tax_mode
    ),
    'menus', (
      select coalesce(json_agg(json_build_object(
        'id', m.id,
        'name', m.name,
        'selling_price', m.selling_price,
        'target_cost_rate', m.target_cost_rate,
        'created_at', m.created_at,
        'category_id', m.category_id
      ) order by m.created_at asc), '[]'::json)
      from public.menus m
      where m.store_id = v_store.id
    ),
    'ingredients', (
      select coalesce(json_agg(json_build_object(
        'id', i.id,
        'name', i.name,
        'current_purchase_price', i.current_purchase_price,
        'price_is_set', i.price_is_set,
        'yield_rate_percent', i.yield_rate_percent,
        'is_prep_item', i.is_prep_item,
        'yield_quantity', i.yield_quantity
      )), '[]'::json)
      from public.ingredients i
      where i.store_id = v_store.id
    ),
    'menu_ingredients', (
      select coalesce(json_agg(json_build_object(
        'menu_id', mi.menu_id,
        'ingredient_id', mi.ingredient_id,
        'quantity', mi.quantity
      )), '[]'::json)
      from public.menu_ingredients mi
      join public.menus m on m.id = mi.menu_id
      where m.store_id = v_store.id
    ),
    'prep_item_components', (
      select coalesce(json_agg(json_build_object(
        'prep_item_id', pc.prep_item_id,
        'component_id', pc.component_id,
        'quantity', pc.quantity
      )), '[]'::json)
      from public.prep_item_components pc
      join public.ingredients i on i.id = pc.prep_item_id
      where i.store_id = v_store.id
    ),
    'sales', (
      select coalesce(json_agg(json_build_object(
        'menu_id', ms.menu_id,
        'quantity_sold', ms.quantity_sold,
        'period_start', ms.period_start,
        'period_end', ms.period_end
      )), '[]'::json)
      from public.menu_sales ms
      join public.menus m on m.id = ms.menu_id
      where m.store_id = v_store.id
        and (p_sales_from is null or ms.period_start >= p_sales_from)
        and (p_sales_to is null or ms.period_end <= p_sales_to)
    ),
    'fixed_costs', (
      select coalesce(json_agg(json_build_object(
        'cost_type', fc.cost_type,
        'amount', fc.amount,
        'period_start', fc.period_start,
        'period_end', fc.period_end
      )), '[]'::json)
      from public.store_fixed_costs fc
      where fc.store_id = v_store.id
    )
  ) into result;

  return result;
end;
$$;

commit;
