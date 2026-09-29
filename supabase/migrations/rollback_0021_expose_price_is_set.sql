-- 0021_expose_price_is_set.sql を元に戻すSQL。
--
-- これは通常の連番マイグレーションではない(自動では実行されない、手動で
-- 必要になった時だけSQL Editorから実行するファイル)。
--
-- 実行すると、get_store_data・get_ingredient_price_historyの2つの関数を、
-- price_is_set列を返す前(0016・0013時点)の内容に戻す。0020で追加した
-- price_is_set列自体(テーブルのデータ)には触れない。

begin;

-- 0016時点のget_store_data(price_is_setを含まない)に戻す。
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

-- 0013時点のget_ingredient_price_history(price_is_setを含まない)に戻す。
-- 戻り値の列数が変わるため、create or replaceではなく一度削除してから作り直す。
drop function if exists public.get_ingredient_price_history();

create function public.get_ingredient_price_history()
returns table (ingredient_id uuid, price numeric, recorded_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  select h.ingredient_id, h.price, h.recorded_at
  from public.ingredient_price_history h
  join public.ingredients i on i.id = h.ingredient_id
  join public.stores s on s.id = i.store_id
  where s.owner_id = auth.uid()
  order by h.ingredient_id, h.recorded_at asc
$$;

grant execute on function public.get_ingredient_price_history() to authenticated;

commit;
