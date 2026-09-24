-- 仕込み品(サブレシピ)対応。
--
-- 仕込み品は「食材」テーブルの中の特殊な行として扱う(is_prep_item=true)。
-- こうすることで、メニュー編集画面の食材選択UI・menu_ingredientsの構造を
-- 一切変えずに、仕込み品もメニューの材料として選べるようにできる。
--
-- 仕込み品の単価(current_purchase_price)は保存しない。自分のレシピ
-- (prep_item_components)をその場でたどって計算する方式にする(元の食材価格が
-- 変わった時に単価の再計算を忘れる、という事故を構造的に防ぐため)。

alter table public.ingredients
  add column is_prep_item boolean not null default false,
  add column yield_quantity numeric check (yield_quantity is null or yield_quantity > 0);

-- ============================================================
-- prep_item_components: 仕込み品のレシピ明細(menu_ingredientsと同じ形)。
-- component_idは通常の食材、または別の仕込み品(入れ子)のどちらも指せる。
-- ============================================================
create table public.prep_item_components (
  id uuid primary key default gen_random_uuid(),
  prep_item_id uuid not null references public.ingredients(id) on delete cascade,
  component_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  unique (prep_item_id, component_id),
  check (prep_item_id <> component_id)
);

create index prep_item_components_prep_item_id_idx on public.prep_item_components(prep_item_id);
create index prep_item_components_component_id_idx on public.prep_item_components(component_id);

alter table public.prep_item_components enable row level security;

create policy prep_item_components_owner_all on public.prep_item_components
  for all using (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = prep_item_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = prep_item_id and s.owner_id = auth.uid()
    )
  );

-- get_store_data(0008で新設、0011・0012で更新済み)に、仕込み品の判定に必要な
-- 情報(is_prep_item・yield_quantity・prep_item_components)を追加する。
-- 戻り値の型はjsonのままなのでCREATE OR REPLACEで本体だけ差し替えられる。
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
        'created_at', m.created_at
      ) order by m.created_at asc), '[]'::json)
      from public.menus m
      where m.store_id = v_store.id
    ),
    'ingredients', (
      select coalesce(json_agg(json_build_object(
        'id', i.id,
        'name', i.name,
        'current_purchase_price', i.current_purchase_price,
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

grant execute on function public.get_store_data(date, date) to authenticated;
