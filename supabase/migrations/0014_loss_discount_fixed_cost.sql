-- 実質原価率(理論原価率+ロス・値引き額)機能のため、store_fixed_costsで扱える
-- cost_typeに 'loss'(月次のロス・値引き額)を追加する。
--
-- 家賃・人件費と全く同じ入れ物(store_fixed_costs)を使い回す。ロスも人件費と同じく
-- 月ごとに変動するため、period_start=月初/period_end=月末を指定して月次で入力する運用。

alter table public.store_fixed_costs
  drop constraint if exists store_fixed_costs_cost_type_check;

alter table public.store_fixed_costs
  add constraint store_fixed_costs_cost_type_check check (cost_type in ('rent', 'labor', 'loss'));
