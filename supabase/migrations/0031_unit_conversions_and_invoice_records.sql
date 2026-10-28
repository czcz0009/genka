-- 納品書の読み取りの設計の2・3段目(2026-10-28)。設計: docs/design-invoice-flow.md
--
-- 1. ingredient_unit_conversions(換算を覚える表)
--    「玉ねぎ 1個 = 200g」のように、食材ごとに「仕入れの単位1つが何にあたるか」を、店主が確定した値だけ持つ。
--    次の納品書から、聞かずに換算する(画面には換算の値を出し、その場で直せる)。
--    - 1つの食材に、複数の仕入れの単位(個・箱など)を持てる。食材×単位で1行
--    - amount・amount_unit は店主が入れたまま持つ(例: 1箱 = 10 kg。食材の単位が g でも、kg のまま)。
--      食材の単位への換算(10kg → 10000g)は、使うときにアプリで行う(src/lib/invoiceOcr/unitPrice.ts)
--    - normalized_unit は「個」「個 」「ｋｇ」などの書き方のゆれをそろえた値(全角半角・前後の空白・大文字小文字)。DBが自動で作る
--    - source: 'owner' = 店主が入れた値 / 'estimate' = 目安(玉ねぎ1個 約200g など)を店主が確かめて確定した値
--    - 食材を消すと一緒に消える。退会(アカウントの削除)でも、店舗→食材と一緒に消える
--
-- 2. invoice_scan_records(同じ納品書の二度読みに気づくための記録)
--    確定した納品書の「日付・仕入れ先(書き方をそろえたもの)・合計金額」だけを持つ。写真・品目・金額の明細は持たない。
--    次に読み取った納品書と3つとも一致したら、「この納品書は読み取り済みかもしれません」と知らせる(止めはしない)
--
-- 権限の決まり(RLS): どちらも、自分の店舗のものだけ読み書きできる。
--    換算の表は、食材 → 店舗 → 持ち主 を辿って確かめる(店舗の列を別に持たないので、食材と店舗の食い違いが起きない。点検16番の反省)
--
-- 全体を1つの do ブロックにしている(途中で失敗すれば全部取り消される)。何度実行しても同じ形になる。
-- 最後に migration_log に記録する。
-- 確かめ方: src/lib/invoiceOcr/conversionSql.test.ts(0001〜0031を流して、S-1〜S-9を確かめる)

do $m0031$
begin

-- ============================================================
-- 1. 換算を覚える表
-- ============================================================
create table if not exists public.ingredient_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  purchase_unit text not null check (char_length(btrim(purchase_unit)) between 1 and 20),
  normalized_unit text generated always as (lower(btrim(normalize(purchase_unit, NFKC)))) stored,
  amount numeric not null check (amount > 0 and amount <= 1000000),
  amount_unit text not null check (char_length(btrim(amount_unit)) between 1 and 20),
  source text not null check (source in ('owner', 'estimate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

if not exists (select 1 from pg_constraint where conname = 'ingredient_unit_conversions_ingredient_unit_key') then
  alter table public.ingredient_unit_conversions
    add constraint ingredient_unit_conversions_ingredient_unit_key unique (ingredient_id, normalized_unit);
end if;

drop trigger if exists ingredient_unit_conversions_set_updated_at on public.ingredient_unit_conversions;
create trigger ingredient_unit_conversions_set_updated_at before update on public.ingredient_unit_conversions
  for each row execute function public.set_updated_at();

alter table public.ingredient_unit_conversions enable row level security;

drop policy if exists ingredient_unit_conversions_owner_all on public.ingredient_unit_conversions;
create policy ingredient_unit_conversions_owner_all on public.ingredient_unit_conversions
  for all using (
    exists (
      select 1 from public.ingredients i join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ingredients i join public.stores s on s.id = i.store_id
      where i.id = ingredient_id and s.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 2. 同じ納品書の二度読みに気づくための記録
-- ============================================================
create table if not exists public.invoice_scan_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_date date not null,
  supplier_normalized text not null check (char_length(supplier_normalized) between 1 and 100),
  total_amount numeric not null check (total_amount >= 0 and total_amount < 100000000),
  created_at timestamptz not null default now()
);

create index if not exists invoice_scan_records_store_date_idx on public.invoice_scan_records(store_id, invoice_date);

alter table public.invoice_scan_records enable row level security;

-- 読むのと足すのだけ(直す・消すは不要。店舗を消すと一緒に消える)
drop policy if exists invoice_scan_records_owner_select on public.invoice_scan_records;
create policy invoice_scan_records_owner_select on public.invoice_scan_records
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

drop policy if exists invoice_scan_records_owner_insert on public.invoice_scan_records;
create policy invoice_scan_records_owner_insert on public.invoice_scan_records
  for insert with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

insert into public.migration_log (version, name)
values ('0031', '0031_unit_conversions_and_invoice_records')
on conflict (version) do nothing;

end $m0031$;
