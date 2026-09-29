-- 退会(アカウント削除)の申請を記録するテーブル。
--
-- 方針: 即時削除ではなく30日間の猶予期間を置く。申請するとこの表に1行できる。
-- 実際のauth.users削除は、猶予期間が過ぎた行を毎日のcronジョブ
-- (api/cron/delete-scheduled-accounts)がservice role権限で処理する。
-- 猶予期間中に本人が取り消せば、この行を削除するだけでよい
-- (退会自体を取りやめたことになる)。
--
-- 猶予期間中は、同じメールアドレスでの再登録はできない(auth.usersの行が
-- まだ残っているため)。これは仕様として許容する。
--
-- 1ユーザーにつき申請は同時に1件まで(primary keyがuser_id)。

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- 実行予定日時(=申請日時+30日)。cronジョブはこの列だけを見て判定するため、
  -- 「猶予日数を後で変えたくなった時に既存の申請行を計算し直さずに済む」よう、
  -- 申請時点の値をそのまま保存する(生成列にしない)。
  scheduled_for timestamptz not null
);

alter table public.account_deletion_requests enable row level security;

-- 本人は自分の申請だけ読み書き(申請・取り消し)できる。
create policy account_deletion_requests_owner_select on public.account_deletion_requests
  for select using (user_id = auth.uid());

create policy account_deletion_requests_owner_insert on public.account_deletion_requests
  for insert with check (user_id = auth.uid());

create policy account_deletion_requests_owner_delete on public.account_deletion_requests
  for delete using (user_id = auth.uid());

-- update・実際の削除実行はservice role(cronジョブ)のみが行うため、
-- updateポリシーは用意しない(RLSはservice roleには適用されない)。
