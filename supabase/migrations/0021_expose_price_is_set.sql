-- 0020で追加したprice_is_set列を、既存のRPCからも返すようにする。
-- 戻り値の型・シグネチャは変えず(json / table定義とも同じ)、本体だけ差し替える。
--
-- 元に戻したい場合は rollback_0021_expose_price_is_set.sql を実行すること。

begin;

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

-- 戻り値の列を追加するため、create or replaceでは直せない
-- (PostgreSQLの仕様: RETURNS TABLEの列構成が変わる関数はreplace不可)。
-- 一度削除してから作り直す。
drop function if exists public.get_ingredient_price_history();

create function public.get_ingredient_price_history()
returns table (ingredient_id uuid, price numeric, recorded_at timestamptz, price_is_set boolean)
language sql
security invoker
set search_path = public
as $$
  select h.ingredient_id, h.price, h.recorded_at, h.price_is_set
  from public.ingredient_price_history h
  join public.ingredients i on i.id = h.ingredient_id
  join public.stores s on s.id = i.store_id
  where s.owner_id = auth.uid()
  order by h.ingredient_id, h.recorded_at asc
$$;

grant execute on function public.get_ingredient_price_history() to authenticated;

commit;
