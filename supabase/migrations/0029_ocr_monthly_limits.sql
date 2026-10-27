-- 納品書の読み取り(AI)の回数の上限を、モニター期間向けに見直す(2026-10-27)。
--
-- 値(Mahiro確認済み。src/lib/invoiceOcr/usageLimit.ts と同じ。値を変えるときは両方を直す):
--   1アカウント: 月の成功50回・月の試行100回(日本時間の毎月1日にリセット)
--   アプリ全体: 1日の試行200回(日本時間の0時にリセット)
--
-- 作るもの:
--   ocr_usage_monthly       … 利用者ごと・月ごとの回数(本人は読むだけ。書き換えは関数だけ)
--   ocr_usage_daily_total   … アプリ全体の1日の試行回数(利用者からは見えない)
--   ocr_attempt_reservations … 読み取り1回ごとの受付票(利用者からは見えない)。成功・取り消しは、この受付票の番号が
--                              分かるサーバーの処理だけが行える(利用者が自分の回数を勝手に戻せないようにするため)
--   ocr_service_incidents   … AIの残高不足・鍵の問題・混雑の記録(いつ・何の種類か だけ。個人の情報は入れない)
--   begin_ocr_attempt_v2()  … 上限を確かめて、試行を1回数え、受付票の番号を返す
--   complete_ocr_success_v2(受付票) … 成功を1回数える
--   cancel_ocr_attempt_v2(受付票, 種類) … AI側の都合で失敗したとき、試行を取り消す(店主の回数を減らさない)
--   ocr_jst_now()           … 日本時間の今(テストで時刻を差し替えるための入口)
--
-- 上限の値は関数の中に書く(呼び出し側から渡さない)。利用者が関数を直接呼んでも、上限は変えられない。
-- 今の関数(begin_ocr_attempt・complete_ocr_success と ocr_usage 表)は、今の本番のアプリが使っているので残す。
-- 新しいアプリのデプロイの後に、別のマイグレーションで消す。
--
-- 全体を1つの do ブロックにしている(途中で失敗すれば全部取り消される)。何度実行しても同じ形になる。
-- 確かめ方: src/lib/invoiceOcr/ocrUsageSql.test.ts(使い捨てのPostgresで0001〜0029を流して、Q-3〜Q-11を確かめる)

do $m0029$
begin

-- 日本時間の今(テストではこの関数を差し替えて、月や日の変わり目を確かめる)
create or replace function public.ocr_jst_now()
returns timestamp
language sql
stable
set search_path = public
as $f$ select (now() at time zone 'Asia/Tokyo') $f$;

create table if not exists public.ocr_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  used_count integer not null default 0 check (used_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.ocr_usage_monthly enable row level security;
if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ocr_usage_monthly' and policyname = 'ocr_usage_monthly_select_own') then
  create policy ocr_usage_monthly_select_own on public.ocr_usage_monthly for select using (user_id = auth.uid());
end if;
revoke insert, update, delete on table public.ocr_usage_monthly from anon, authenticated;

create table if not exists public.ocr_usage_daily_total (
  day date primary key,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ocr_usage_daily_total enable row level security;
revoke all on table public.ocr_usage_daily_total from anon, authenticated;

create table if not exists public.ocr_attempt_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  day date not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.ocr_attempt_reservations enable row level security;
revoke all on table public.ocr_attempt_reservations from anon, authenticated;

create table if not exists public.ocr_service_incidents (
  id bigserial primary key,
  kind text not null check (kind in ('credit', 'auth', 'busy')),
  occurred_at timestamptz not null default now()
);
alter table public.ocr_service_incidents enable row level security;
revoke all on table public.ocr_service_incidents from anon, authenticated;

-- 上限を確かめて、試行を1回数える。戻り値: {"result":"ok","reservation":"<番号>"} か {"result":"use_limit"} 等
create or replace function public.begin_ocr_attempt_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  monthly_use_limit constant integer := 50;
  monthly_attempt_limit constant integer := 100;
  global_daily_attempt_limit constant integer := 200;
  jst timestamp := public.ocr_jst_now();
  m text := to_char(jst, 'YYYY-MM');
  d date := jst::date;
  u integer;
  a integer;
  g integer;
  r uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ocr_usage_monthly (user_id, month) values (auth.uid(), m) on conflict (user_id, month) do nothing;
  select used_count, attempt_count into u, a from public.ocr_usage_monthly where user_id = auth.uid() and month = m for update;
  if u >= monthly_use_limit then return jsonb_build_object('result', 'use_limit'); end if;
  if a >= monthly_attempt_limit then return jsonb_build_object('result', 'attempt_limit'); end if;
  insert into public.ocr_usage_daily_total (day) values (d) on conflict (day) do nothing;
  select attempt_count into g from public.ocr_usage_daily_total where day = d for update;
  if g >= global_daily_attempt_limit then return jsonb_build_object('result', 'global_limit'); end if;
  update public.ocr_usage_daily_total set attempt_count = attempt_count + 1, updated_at = now() where day = d;
  update public.ocr_usage_monthly set attempt_count = attempt_count + 1, updated_at = now() where user_id = auth.uid() and month = m;
  insert into public.ocr_attempt_reservations (user_id, month, day) values (auth.uid(), m, d) returning id into r;
  return jsonb_build_object('result', 'ok', 'reservation', r);
end;
$f$;

-- 成功を1回数える(受付票が本人のもので、まだ処理していないときだけ)。戻り値: その月の成功回数(数えなかったときは null)
create or replace function public.complete_ocr_success_v2(p_reservation uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $f$
declare
  m text;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.ocr_attempt_reservations set status = 'succeeded'
    where id = p_reservation and user_id = auth.uid() and status = 'pending'
    returning month into m;
  if m is null then return null; end if;
  update public.ocr_usage_monthly set used_count = used_count + 1, updated_at = now()
    where user_id = auth.uid() and month = m
    returning used_count into n;
  return n;
end;
$f$;

-- AI側の都合(残高不足・鍵・混雑・障害)で失敗したとき、試行を取り消す(店主の回数も、全体の回数も戻す)。
-- p_incident が credit・auth・busy なら記録する(同じ種類は10分に1件まで。表が増え続けないように)
create or replace function public.cancel_ocr_attempt_v2(p_reservation uuid, p_incident text)
returns void
language plpgsql
security definer
set search_path = public
as $f$
declare
  m text;
  d date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.ocr_attempt_reservations set status = 'cancelled'
    where id = p_reservation and user_id = auth.uid() and status = 'pending'
    returning month, day into m, d;
  if m is null then return; end if;
  update public.ocr_usage_monthly set attempt_count = greatest(attempt_count - 1, 0), updated_at = now()
    where user_id = auth.uid() and month = m;
  update public.ocr_usage_daily_total set attempt_count = greatest(attempt_count - 1, 0), updated_at = now()
    where day = d;
  if p_incident in ('credit', 'auth', 'busy') and not exists (
    select 1 from public.ocr_service_incidents where kind = p_incident and occurred_at > now() - interval '10 minutes'
  ) then
    insert into public.ocr_service_incidents (kind) values (p_incident);
  end if;
end;
$f$;

revoke all on function public.ocr_jst_now() from public;
revoke all on function public.begin_ocr_attempt_v2() from public;
revoke all on function public.complete_ocr_success_v2(uuid) from public;
revoke all on function public.cancel_ocr_attempt_v2(uuid, text) from public;
grant execute on function public.begin_ocr_attempt_v2() to authenticated;
grant execute on function public.complete_ocr_success_v2(uuid) to authenticated;
grant execute on function public.cancel_ocr_attempt_v2(uuid, text) to authenticated;

insert into public.migration_log (version, name) values ('0029', '0029_ocr_monthly_limits') on conflict (version) do nothing;

end $m0029$;
