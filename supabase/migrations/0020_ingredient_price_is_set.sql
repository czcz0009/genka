-- 食材の単価が「入力済みか」を明示的に区別する列を追加する。
--
-- 背景(不具合): current_purchase_priceはnot null defaultが0のため、単価を
-- 一度も入力していない食材と、意図的に0円で登録した食材(例: 水)を区別
-- できず、原価率が0%の「正常」と誤表示されるメニューがあった。
--
-- 方針: price_is_setをfalseがデフォルトの列として追加する(安全側)。
-- 空欄のまま保存された食材はfalseのまま、単価を入力する(0円の明示も含む)と
-- trueになる。仕込み品(is_prep_item=true)は仕入単価を持たないため対象外。
--
-- 履歴テーブル(ingredient_price_history)にも同じ列を追加する。「今見直す
-- べきメニュー」の過去月表示・FL比率の月次推移が、当時の設定状況を正しく
-- 再現できるようにするため(過去に未設定→後日に設定、という変化があっても
-- 過去の月の表示は当時のまま保たれる)。

alter table public.ingredients
  add column price_is_set boolean not null default false;

-- 既存データの補正: 現在の単価が0より大きければ「設定済み」とみなす。
-- 0円の食材は、意図的な0円だったのか未入力だったのかをこのデータだけからは
-- 区別できないため、いったん「未設定」扱いにする。
-- (適用前に、0で.sqlと合わせて配布したSELECT文で対象を確認すること。
--  意図的に0円だった食材は、移行後に単価編集画面で0を入力し直せば
--  price_is_set=trueに戻る)
update public.ingredients
  set price_is_set = (current_purchase_price > 0)
  where is_prep_item = false;

alter table public.ingredient_price_history
  add column price_is_set boolean not null default false;

-- 履歴の既存データも、行ごとの金額を見て同じルールで補正する。
update public.ingredient_price_history
  set price_is_set = (price > 0);
