-- 0025_categories.sql を元に戻すSQL。
--
-- これは通常の連番マイグレーションではない(自動では実行されない、手動で
-- 必要になった時だけSQL Editorから実行するファイル)。
--
-- 注意: 実行すると、作成したカテゴリと、メニュー・食材に付けたカテゴリの情報は
-- すべて消える(メニュー・食材そのもの、価格、レシピ等には影響しない)。
--
-- 実行すると、get_store_dataを0021時点の内容(category_idを含まない)に戻し、
-- 0025で追加した関数・トリガー・列・テーブルを削除する。
--
-- 全体を1つの do ブロックにしている(1つの文なので、途中でエラーになれば全部が取り消される)。
-- SQL Editorでは begin〜commit が1つのまとまりとして実行されないことがあり、途中で止まると
-- 一部だけが消えた中途半端な状態になるため(2026-10-23)。何度実行しても同じ形になる。

do $rollback$
begin

-- 0021時点のget_store_data(category_idを含まない)に戻す。
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

drop function if exists public.get_categories();

drop trigger if exists stores_seed_default_categories on public.stores;
drop function if exists public.stores_seed_default_categories();
drop function if exists public.seed_default_categories(uuid);

alter table public.stores drop column if exists categories_seeded_at;

-- 列を消すと、その列のインデックス(menus_category_id_idx等)も一緒に消える。
alter table public.menus drop column if exists category_id;
alter table public.ingredients drop column if exists category_id;

drop table if exists public.categories;

end $rollback$;
