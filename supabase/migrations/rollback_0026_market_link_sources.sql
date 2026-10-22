-- 0026_market_link_sources.sql を元に戻すSQL。
--
-- これは通常の連番マイグレーションではない(自動では実行されない、手動で
-- 必要になった時だけSQL Editorから実行するファイル)。
--
-- 注意: 実行すると、利用者が保存した「野菜・果物の紐づけ」と「比べない」の設定は消える
-- (食肉の紐づけは残る。食材そのもの、価格、レシピ等には影響しない)。
-- アプリを0026より前の版に戻してから実行すること(新しい版のアプリは、これらの種類を書き込むため)。

begin;

delete from public.ingredient_market_links where source in ('syuyo', 'excluded');

alter table public.ingredient_market_links drop constraint ingredient_market_links_ingredient_id_key;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_ingredient_id_source_key unique (ingredient_id, source);

alter table public.ingredient_market_links drop constraint ingredient_market_links_item_code_by_source;
alter table public.ingredient_market_links alter column item_code set not null;

alter table public.ingredient_market_links drop constraint ingredient_market_links_source_check;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_source_check check (source in ('chikusan'));

commit;
