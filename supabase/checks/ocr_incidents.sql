-- 納品書の読み取りで、AI側の都合(残高不足など)の失敗が起きていないかを見る。読むだけで、何も変更しない。
-- credit = Anthropicの残高不足・支払いの問題(残高を足す必要がある)
-- auth   = AIの鍵の問題(Vercelの ANTHROPIC_API_KEY を確かめる)
-- busy   = AI側の混雑・障害・通信の失敗(続くときだけ気にする)
-- 同じ種類は10分に1件までしか記録しない。個人の情報は入っていない。
select kind as "種類",
       count(*) as "件数",
       min(occurred_at at time zone 'Asia/Tokyo') as "最初(日本時間)",
       max(occurred_at at time zone 'Asia/Tokyo') as "最後(日本時間)"
from public.ocr_service_incidents
where occurred_at > now() - interval '30 days'
group by kind
order by max(occurred_at) desc;
