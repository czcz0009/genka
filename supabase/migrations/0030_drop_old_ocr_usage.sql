-- 納品書の読み取りの、古い数え方(β期間の累計3回・試行10回)の関数と表を消す(2026-10-27)。
--
-- 0029で月ごとの数え方(begin/complete/cancel_ocr_attempt_v2、ocr_usage_monthly 等)に切り替え、
-- 新しいアプリ(83d3a1e)を2026-10-27 17:31にデプロイし、本番で読み取りが新しい数え方で動くことを確かめた。
-- アプリはもう古い関数・表を使っていない(src と scripts に呼び出しが無いことを確認済み)。
--
-- 消すもの:
--   関数 begin_ocr_attempt(integer, integer)  … 古い数え方の受付(呼び出し側が上限の値を渡す形)
--   関数 complete_ocr_success()               … 古い数え方の成功の記録
--   表   ocr_usage                             … 利用者ごとの累計の回数(新しい数え方では使わない)
-- 古い表の累計の回数は、新しい数え方に引き継がない(0029の時点で、今月は0から数える方針。Mahiro確認済み)。
--
-- 全体を1つの do ブロックにしている(途中で失敗すれば全部取り消される)。何度実行しても同じ形になる(既に無ければ何もしない)。
-- 元に戻す必要が出たら、0018・0019の該当部分を当て直す(累計の回数は戻らない)。
-- 確かめ方: src/lib/invoiceOcr/ocrUsageSql.test.ts(0001〜0030を流して、古い関数・表が無く、新しい数え方は動くことを確かめる)

do $m0030$
begin

drop function if exists public.begin_ocr_attempt(integer, integer);
drop function if exists public.complete_ocr_success();
drop function if exists public.increment_ocr_usage(); -- 0019で消し済みのはずだが、念のため
drop table if exists public.ocr_usage;

insert into public.migration_log (version, name) values ('0030', '0030_drop_old_ocr_usage') on conflict (version) do nothing;

end $m0030$;
