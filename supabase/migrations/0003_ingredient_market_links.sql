-- 食材(ingredients)と、外部市場データの品目コードを結びつける「確定リンク」テーブル。
--
-- 設計方針:
-- - 青果物(市場CSV由来)は名称の表記ゆれを自動マッチング(matchIngredientToItem.ts)で
--   吸収できるが、畜産物(枝肉の規格: 和牛去勢A5/A4等)は「豚肉」「牛肉ロース」のような
--   登録のされ方だとどの規格の価格に対応するか一意に決まらない。誤って違う規格と
--   結びつけると原価計算そのものが狂うため、自動マッチングでは確定させず、
--   店主が明示的に選択・確認した組み合わせだけをこのテーブルに保存する
--   (src/lib/marketPrices/livestock/suggestChikusanItem.ts は候補の「提案」のみ行い、
--   ここへの書き込みはユーザー操作を経て初めて行われる想定)。
-- - source列で将来的に畜産物以外の外部データソースが増えても同じ構造で扱えるようにする。

create table if not exists public.ingredient_market_links (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  -- 'chikusan' = 畜産物卸売価格の推移(月報告)。将来的に他の外部データソースが増えたら追加する。
  source text not null check (source in ('chikusan')),
  -- src/lib/marketPrices/livestock/chikusanColumns.ts の ChikusanItemCode に対応
  item_code text not null,
  created_at timestamptz not null default now(),
  unique (ingredient_id, source)
);

create index if not exists ingredient_market_links_ingredient_id_idx
  on public.ingredient_market_links(ingredient_id);

alter table public.ingredient_market_links enable row level security;

create policy ingredient_market_links_owner_all on public.ingredient_market_links
  for all using (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ingredients i
      join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  );
