-- 食材ごとの仕入単価変更履歴を「全件」まとめて取得するRPC。
--
-- 背景: 既存の get_ingredient_previous_prices(0009)は「直近2件」しか返さないため
-- 「今見直すべきメニュー」画面や「FL比率」画面で過去の月を見たときに、その月の時点で
-- 実際に使われていた仕入単価を再現できない(結果、過去の月の原価率・原価合計・FL比率が
-- 現在の仕入単価で遡及的に再計算されてしまう)。
--
-- この関数は履歴を全件返し、呼び出し側(resolveHistoricalPrice、src/lib/ingredientPriceHistory.ts)
-- で「対象月の末日時点で最新だった価格」をJS側で解決する。
--
-- 安全性について: SECURITY DEFINER は使わず(既定の SECURITY INVOKER)、
-- 呼び出したユーザー自身の店舗の食材の履歴だけに絞り込んでいる(owner_idの突合)。

create or replace function public.get_ingredient_price_history()
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
