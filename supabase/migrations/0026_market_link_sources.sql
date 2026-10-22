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
-- 1つの食材に保存できる紐づけは1つだけ(食材ごとに1行。unique (ingredient_id) を追加)。
--
-- 古い決まり unique (ingredient_id, source) は、このマイグレーションでは**消さずに残す**
-- (無ければ作り直す)。このマイグレーションを先に適用し、新しいアプリのデプロイは後になるため、
-- その間も今の本番のアプリ(食肉の紐づけを onConflict: "ingredient_id,source" で上書き保存している)
-- が動くようにするため。古い決まりは、新しいアプリ(onConflict: "ingredient_id" で保存する)を
-- デプロイした後に、別のマイグレーションで消す。
--
-- 何度実行しても同じ形になる(2026-10-22、最初の版を一度実行した後に、この版を実行したところ
-- 「すでにある決まり」でエラーになったため、既にある決まりは作り直す・足りない決まりだけ足す形にした)。
--
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

-- 種類に「野菜・果物」「比べない」を足す(既にあれば作り直す)
alter table public.ingredient_market_links drop constraint if exists ingredient_market_links_source_check;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_source_check check (source in ('chikusan', 'syuyo', 'excluded'));

-- 品目コード: 「比べない」は空、それ以外は必須(既にあれば作り直す)
alter table public.ingredient_market_links alter column item_code drop not null;
alter table public.ingredient_market_links drop constraint if exists ingredient_market_links_item_code_by_source;
alter table public.ingredient_market_links
  add constraint ingredient_market_links_item_code_by_source check (
    (source in ('chikusan', 'syuyo') and item_code is not null)
    or (source = 'excluded' and item_code is null)
  );

-- 1つの食材に紐づけは1つだけ(無ければ足す)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ingredient_market_links'::regclass and conname = 'ingredient_market_links_ingredient_id_key'
  ) then
    alter table public.ingredient_market_links
      add constraint ingredient_market_links_ingredient_id_key unique (ingredient_id);
  end if;
end $$;

-- 古い決まり(食材×種類で1行)は残す。最初の版で消してしまっていた場合は作り直す
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

commit;
