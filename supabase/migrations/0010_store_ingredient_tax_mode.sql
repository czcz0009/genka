-- 「仕入単価は税込・税抜のどちらで入力しているか」を店舗ごとに保持する設定。
--
-- 背景: 売価は総額表示(2021年施行)により税込で入力・表示するのが原則なので
-- 断定できるが、仕入単価は仕入先の請求書が税抜表記であることが多い一方、
-- 店主が実際に支払った税込金額のまま入力している可能性もあり、どちらかは
-- 店舗ごとに違う。自動判定はせず、店主自身に選んでもらってラベル表示だけを
-- 切り替える(原価率の計算式自体は変更しない = 消費税の按分計算はしない)。
--
-- 既存の店舗にはデフォルト'exclusive'(税抜)を設定する。これは仕入先の
-- 請求書・納品書が税抜表記であることが多い、という一般的な傾向に基づく
-- 初期値であり、店舗ごとに設定画面からいつでも変更できる。

alter table public.stores
  add column ingredient_price_tax_mode text not null default 'exclusive'
    check (ingredient_price_tax_mode in ('inclusive', 'exclusive'));

-- get_or_create_store(0007マイグレーション)の戻り値にingredient_price_tax_modeを
-- 追加する。RETURNS TABLEの列構成を変える場合、CREATE OR REPLACEでは不可
-- (列の追加・変更にはDROPが必要)なため、DROP→CREATEし直す。
drop function if exists public.get_or_create_store();

create function public.get_or_create_store()
returns table (id uuid, name text, default_target_cost_rate numeric, ingredient_price_tax_mode text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.stores (owner_id, name, default_target_cost_rate)
  values (auth.uid(), 'マイ店舗', 30)
  on conflict (owner_id) do nothing;

  return query
    select s.id, s.name, s.default_target_cost_rate, s.ingredient_price_tax_mode
    from public.stores s
    where s.owner_id = auth.uid();
end;
$$;

grant execute on function public.get_or_create_store() to authenticated;
