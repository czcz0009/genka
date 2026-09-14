-- get_store_data(0008マイグレーション)が返すstoreオブジェクトにも
-- ingredient_price_tax_modeを含める。StoreData.storeの型がStoreInfoと
-- 共通のため、こちらも合わせておく必要がある。
--
-- 戻り値の型はjson(RETURNS TABLEではない)なので、CREATE OR REPLACEで
-- 本体だけ差し替えられる(DROPは不要)。

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
        'current_purchase_price', i.current_purchase_price
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
