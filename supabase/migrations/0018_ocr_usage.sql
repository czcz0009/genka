-- 納品書OCR(AI読み取り)の利用回数。β期間中のコスト管理のため、
-- ユーザーごとの累計利用回数に上限を設ける(上限値はアプリ側の定数で管理)。
--
-- 利用者自身が回数を書き換えられないよう、本人には「読む」権限だけを与え、
-- 加算は下のRPC(security definer)経由に限定する。

create table public.ocr_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ocr_usage enable row level security;

create policy ocr_usage_select_own on public.ocr_usage
  for select using (user_id = auth.uid());

create or replace function public.increment_ocr_usage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ocr_usage (user_id, used_count)
  values (auth.uid(), 1)
  on conflict (user_id) do update
    set used_count = public.ocr_usage.used_count + 1, updated_at = now()
  returning used_count into new_count;
  return new_count;
end;
$$;

revoke all on function public.increment_ocr_usage() from public;
grant execute on function public.increment_ocr_usage() to authenticated;
