-- 食材と市場の品目の「利用者が確定した紐づけ」に、野菜・果物と「比べない」を足す(2026-10-22)。
--
-- 背景: 食材名と野菜・果物の品目の対応づけで、紛らわしい名前(もも=鶏もも、かき=牡蠣、ポテト=冷凍の
-- フライドポテト等)を「推定(確認が必要)」に下げた。推定はアラートを出さないため、利用者が
-- 「これで合っている」と確定させる手段と、「市場価格と比べない」と決める手段が必要になった。
-- これまで食肉(chikusan)専用だったこの表を、そのまま流用する。
--
-- 種類(source):
--   'chikusan' = 食肉の規格に紐づけ(item_code = 規格のコード。必須)
--   'syuyo'    = 野菜・果物の品目に紐づけ(item_code = 農水省の品目コード。必須)
--   'excluded' = 市場価格と比べない(item_code は空。辞書との一致や推定より優先される)
--
-- 1つの食材に保存できる紐づけは1つだけ(食材ごとに1行。unique)。
-- 元に戻すSQLは rollback_0026_market_link_sources.sql。

begin;

-- 事前条件: 食材ごとに1行になっていること(なっていなければ、ここで止める)
do $$
begin
  if exists (
    select 1 from public.ingredient_market_links
    group by ingredient_id having count(*) > 1
  ) then
    raise exception '同じ食材に2行以上の紐づけがあります。先に確認してください';
  end if;
end $$;

-- 種類に「野菜・果物」「比べない」を足す
alter table public.ingredient_market_links drop constraint ingredient_market_links_source_check;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_source_check check (source in ('chikusan', 'syuyo', 'excluded'));

-- 品目コード: 「比べない」は空、それ以外は必須
alter table public.ingredient_market_links alter column item_code drop not null;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_item_code_by_source check (
    (source in ('chikusan', 'syuyo') and item_code is not null)
    or (source = 'excluded' and item_code is null)
  );

-- 1つの食材に紐づけは1つだけ(以前は「食材×種類」ごとに1行だった)
alter table public.ingredient_market_links drop constraint ingredient_market_links_ingredient_id_source_key;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_ingredient_id_key unique (ingredient_id);

commit;
