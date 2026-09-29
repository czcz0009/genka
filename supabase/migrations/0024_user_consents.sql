-- 利用規約・プライバシーポリシーへの同意記録。
--
-- 新規登録時、および既存ユーザーが未同意の場合(規約を整備した後の初回
-- ログイン時)に、1行だけ作る・上書きする(1ユーザー1行、常に最新の
-- 同意だけを保持すればよいため primary key は user_id)。

create table public.user_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- src/lib/legalVersion.ts の TERMS_VERSION と同じ文字列を保存する。
  terms_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

create policy user_consents_owner_select on public.user_consents
  for select using (user_id = auth.uid());

create policy user_consents_owner_upsert on public.user_consents
  for insert with check (user_id = auth.uid());

create policy user_consents_owner_update on public.user_consents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
