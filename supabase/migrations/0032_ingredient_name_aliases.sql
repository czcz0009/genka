-- 納品書の読み取りの設計の4段目: 名前の対応づけを覚える表(2026-10-28)。設計: docs/design-invoice-flow.md
--
-- ingredient_name_aliases: 納品書の表記(玉葱・タマネギ等)と、登録済みの食材の対応。店主が確認の画面で選び直したものだけを覚える。
--   - 店舗×そろえた表記(normalized_alias)で1行。同じ表記を別の食材に選び直したら、上書きする
--   - normalized_alias はアプリで作る(src/lib/invoiceOcr/nameMatching.ts の normalizeIngredientName。カタカナ→ひらがな等)
--   - 食材を消すと一緒に消える。退会でも、店舗と一緒に消える
--
-- 権限の決まり(RLS): 自分の店舗のものだけ。**店舗の列と食材の両方を確かめる**(食材がその店舗のもので、店舗の持ち主が自分)。
--   店舗の列を持つのは「店舗×表記で1行」の決まりのため。食材の側だけ・店舗の側だけを見ると、
--   自分の店舗の行に他の店の食材を結びつける(またはその逆)ことができてしまう(点検16番の反省)。
--
-- 全体を1つの do ブロックにしている(途中で失敗すれば全部取り消される)。何度実行しても同じ形になる。最後に migration_log に記録する。
-- 確かめ方: src/lib/invoiceOcr/aliasSql.test.ts(0001〜0032を流して、S2-1〜S2-7を確かめる)

do $m0032$
begin

create table if not exists public.ingredient_name_aliases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  alias text not null check (char_length(btrim(alias)) between 1 and 100),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

if not exists (select 1 from pg_constraint where conname = 'ingredient_name_aliases_store_alias_key') then
  alter table public.ingredient_name_aliases
    add constraint ingredient_name_aliases_store_alias_key unique (store_id, normalized_alias);
end if;

create index if not exists ingredient_name_aliases_ingredient_id_idx on public.ingredient_name_aliases(ingredient_id);

drop trigger if exists ingredient_name_aliases_set_updated_at on public.ingredient_name_aliases;
create trigger ingredient_name_aliases_set_updated_at before update on public.ingredient_name_aliases
  for each row execute function public.set_updated_at();

alter table public.ingredient_name_aliases enable row level security;

drop policy if exists ingredient_name_aliases_owner_all on public.ingredient_name_aliases;
create policy ingredient_name_aliases_owner_all on public.ingredient_name_aliases
  for all using (
    exists (
      select 1 from public.ingredients i join public.stores s on s.id = i.store_id
      where i.id = ingredient_name_aliases.ingredient_id
        and i.store_id = ingredient_name_aliases.store_id
        and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ingredients i join public.stores s on s.id = i.store_id
      where i.id = ingredient_name_aliases.ingredient_id
        and i.store_id = ingredient_name_aliases.store_id
        and s.owner_id = auth.uid()
    )
  );

insert into public.migration_log (version, name)
values ('0032', '0032_ingredient_name_aliases')
on conflict (version) do nothing;

end $m0032$;
