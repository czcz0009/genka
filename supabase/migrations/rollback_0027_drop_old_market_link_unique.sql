-- 0027_drop_old_market_link_unique.sql を元に戻すSQL(古い決まり unique (ingredient_id, source) を作り直す)。
--
-- これは通常の連番マイグレーションではない(自動では実行されない、手動で
-- 必要になった時だけSQL Editorから実行するファイル)。
-- unique (ingredient_id) がある間は、この決まりに反する行は存在しないので、データは変わらない。
-- 何度実行しても同じ形になる(既にあれば何もしない)。

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ingredient_market_links'::regclass and conname = 'ingredient_market_links_ingredient_id_source_key'
  ) then
    alter table public.ingredient_market_links
      add constraint ingredient_market_links_ingredient_id_source_key unique (ingredient_id, source);
  end if;
end $$;
