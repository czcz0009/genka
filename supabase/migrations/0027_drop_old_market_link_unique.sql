-- 食材と市場の品目の紐づけ(ingredient_market_links)の、古い決まり unique (ingredient_id, source) を消す(2026-10-22)。
--
-- 0026で「1つの食材に紐づけは1つだけ」(unique (ingredient_id))を足したが、古い決まりは残していた。
-- マイグレーションを先に適用し、新しいアプリのデプロイが後になったため、その間も古いアプリ
-- (食肉の紐づけを onConflict: "ingredient_id,source" で保存していた)が動くようにするためだった。
-- 新しいアプリ(3b78514。すべて onConflict: "ingredient_id" で保存する)を2026-10-22にデプロイし、
-- 本番で保存の動作を確かめたので、古い決まりを消す。
--
-- 何度実行しても同じ形になる(既に無ければ何もしない)。
-- 元に戻すSQLは rollback_0027_drop_old_market_link_unique.sql。

alter table public.ingredient_market_links drop constraint if exists ingredient_market_links_ingredient_id_source_key;
