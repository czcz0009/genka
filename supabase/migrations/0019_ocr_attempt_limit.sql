-- 0018の補強。「成功した回数」だけを数えると、読み取りに失敗する画像を
-- 繰り返し送ってAI利用料をかけ続けられてしまう(また同時送信で上限をすり抜けられる)。
-- そこで「AIを呼んだ試行回数」も別に数え、行をロックしたうえで判定・加算する。

alter table public.ocr_usage
  add column attempt_count integer not null default 0 check (attempt_count >= 0);

-- 0018の単純な加算関数は不要になったので削除
drop function if exists public.increment_ocr_usage();

-- AIを呼ぶ直前に呼ぶ。許可されたら試行回数を+1して 'ok' を返す。
-- 'use_limit' = 成功回数の上限、'attempt_limit' = 試行回数の上限。
create or replace function public.begin_ocr_attempt(p_use_limit integer, p_attempt_limit integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  u integer;
  a integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ocr_usage (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select used_count, attempt_count into u, a
    from public.ocr_usage where user_id = auth.uid() for update;
  if u >= p_use_limit then return 'use_limit'; end if;
  if a >= p_attempt_limit then return 'attempt_limit'; end if;
  update public.ocr_usage set attempt_count = attempt_count + 1, updated_at = now()
    where user_id = auth.uid();
  return 'ok';
end;
$$;

-- 読み取りに成功したときに呼ぶ。成功回数を+1して新しい値を返す。
create or replace function public.complete_ocr_success()
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

revoke all on function public.begin_ocr_attempt(integer, integer) from public;
revoke all on function public.complete_ocr_success() from public;
grant execute on function public.begin_ocr_attempt(integer, integer) to authenticated;
grant execute on function public.complete_ocr_success() to authenticated;
