-- 「今見直すべきメニュー」画面の「月間の利益への影響額」表示のため、
-- 食材ごとに「現在の仕入単価より1つ前の仕入単価」を1回のRPCでまとめて取得する。
--
-- 背景: ingredient_price_history は仕入単価を更新するたびに1行追加される
-- 履歴テーブル。「直近の価格変更で、このメニューの原価がどれだけ変わったか」を
-- 計算するには、食材ごとに「現在の単価」だけでなく「1つ前の単価」も必要になる。
-- これをアプリ側でN+1(食材ごとに1回ずつ)問い合わせると食材数に比例して
-- 往復回数が増えてしまうため、food材ごとの「2番目に新しい価格」だけを
-- 1回のRPCでまとめて返す(履歴が1件しかない=一度も値上げ・値下げされていない
-- 食材は対象外。その場合は「変わっていない」ので影響額の計算上0円として扱えばよい)。
--
-- 安全性について: SECURITY DEFINER は使わず(既定の SECURITY INVOKER)、
-- 呼び出したユーザー自身の店舗の食材だけに絞り込んでいる(owner_idの突合)。

create or replace function public.get_ingredient_previous_prices()
returns table (ingredient_id uuid, previous_price numeric)
language sql
security invoker
set search_path = public
as $$
  select ranked.ingredient_id, ranked.price as previous_price
  from (
    select
      h.ingredient_id,
      h.price,
      row_number() over (partition by h.ingredient_id order by h.recorded_at desc) as rn
    from public.ingredient_price_history h
    join public.ingredients i on i.id = h.ingredient_id
    join public.stores s on s.id = i.store_id
    where s.owner_id = auth.uid()
  ) ranked
  where ranked.rn = 2
$$;

grant execute on function public.get_ingredient_previous_prices() to authenticated;
