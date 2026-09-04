-- stores.owner_id を一意化する。
--
-- 背景: getOrCreateStore()(select→なければinsert)は、同一ユーザーからの
-- ほぼ同時リクエスト(例: ページの初回レンダリングとNext.jsのプリフェッチが
-- 重なる等)に対してTOCTOUレース条件を持っており、実際に同一ユーザーに対して
-- 複数のstore行が作成される不具合を確認した(実機E2Eテストで検出)。
-- MVPは「1ユーザー1店舗」が前提のため、DB制約でも二重作成を防ぐ。
-- アプリ側(getOrCreateStore)もupsert(onConflict: owner_id, ignoreDuplicates)を
-- 使うレース安全な実装に修正済み。
--
-- 注意: 実行前に同一owner_idの重複storeが残っていると制約違反でエラーになる。
-- 重複がある場合は、先に手動でデータが入っている方を確認してから
-- 空の重複だけ削除してから実行すること(自動削除はデータのある方を誤って
-- 消しかねないため、あえてこのマイグレーションには含めていない)。

alter table public.stores add constraint stores_owner_id_key unique (owner_id);
