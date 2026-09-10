-- getOrCreateStore() をDB関数(RPC)化し、往復回数を最大3回→1回に減らす。
--
-- 背景: 実機計測(本番Vercel東京リージョン)で以下が判明した。
--   - アプリ側の getOrCreateStore() は「upsert(なければ作成) → 再度select」という
--     2回のDB往復を毎回行っており、実測で合計300〜770ms かかっていた。
--   - さらに、その手前で supabase.auth.getUser()(JWTの有効性をSupabase側に
--     問い合わせる、これも実測150〜400msかかるネットワーク処理)を毎回別に
--     呼んでおり、ほとんどの画面では「userIdをgetOrCreateStoreに渡す」以外の
--     用途がなかった。
-- この関数は「認証確認 + 店舗のupsert + 再取得」を1回のRPC呼び出しに統合する。
--
-- 安全性について: SECURITY DEFINER は使わず(既定の SECURITY INVOKER のまま)、
-- 呼び出したユーザー自身の権限・既存のRLSポリシー(stores_owner_all、
-- 0001_init.sqlで定義済み)がそのまま適用される。関数内では auth.uid() だけを
-- 使っており、クライアントから任意のowner_idを渡せる余地はない
-- (他人の店舗を作成・取得することはできない)。
--
-- 未ログイン(auth.uid() が null)の場合は明示的にエラーを送出し、
-- アプリ側で「未ログイン」と「その他の失敗(StoreLoadError表示)」を
-- 区別できるようにしている。

create or replace function public.get_or_create_store()
returns table (id uuid, name text, default_target_cost_rate numeric)
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
    select s.id, s.name, s.default_target_cost_rate
    from public.stores s
    where s.owner_id = auth.uid();
end;
$$;

grant execute on function public.get_or_create_store() to authenticated;
