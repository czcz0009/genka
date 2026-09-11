-- 「メニュー一覧・収益ランキング・FL比率・仕入れ値アラート」が共通して必要とする
-- store配下のデータ(menus・ingredients・menu_ingredients・menu_sales・
-- store_fixed_costs)を1回のRPC呼び出しでまとめて取得する。
--
-- 背景: 実機計測(Vercel⇔Supabaseが別リージョンだったことが判明し、
-- 0007適用後もなお1クエリあたり150〜300msかかっていた時点)で、
-- 各画面が3〜5個のテーブルをPromise.allで並列取得していたことを確認した。
-- 並列化はできていたが、それでも「並列グループの中で一番遅いクエリの時間」分は
-- 待つ必要があり、往復回数そのものを1回に減らせばさらに削減できる。
--
-- 安全性について: SECURITY DEFINER は使わず(既定の SECURITY INVOKER)、
-- 呼び出したユーザー自身のRLSがそのまま適用される。関数内では auth.uid() から
-- 自分のstoreだけを特定しており、他人のデータを取得することはできない。
-- 販売実績(menu_sales)だけ期間で絞り込めるようにしている
-- (FL比率画面は直近6ヶ月分だけ必要なため、絞り込まないと画面が増えるほど
-- 転送量が増え続けてしまう)。絞り込みを省略(null)すれば全期間を返す。

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
  select id, name, default_target_cost_rate
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
      'default_target_cost_rate', v_store.default_target_cost_rate
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
