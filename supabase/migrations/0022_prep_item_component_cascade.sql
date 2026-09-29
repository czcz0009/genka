-- prep_item_components.component_id の外部キーを、ON DELETE RESTRICTから
-- ON DELETE CASCADEに変更する。
--
-- 背景: アカウント削除(退会)機能の実装前に、使い捨てアカウントで
-- auth.admin.deleteUser()を実際に試したところ、
-- 「仕込み品の材料として使われている食材」がある場合に削除全体が
-- 失敗することが分かった(エラー: update or delete on table "ingredients"
-- violates foreign key constraint "prep_item_components_component_id_fkey"）。
--
-- このRESTRICTは、食材一覧の「削除する」ボタンから単体の食材を消そうとした時に
-- 誤って仕込み品のレシピを壊さないための保険として設定されていた。ただし
-- 実際の保護は、DB制約ではなくアプリ側(src/app/(app)/ingredients/actions.ts の
-- deleteIngredient)が既に明示的なチェックで行っている
-- (「この食材は仕込み品『◯◯』の材料として使われているため削除できません」)。
-- そのため、DB側をCASCADEに変えても、通常の食材削除の挙動(引き続きブロックされる)
-- には影響しない。一方、退会でお店ごとまとめて食材を削除する際は、
-- 仕込み品のレシピ明細も一緒に消えてほしいため、CASCADEが必要。

alter table public.prep_item_components
  drop constraint prep_item_components_component_id_fkey;

alter table public.prep_item_components
  add constraint prep_item_components_component_id_fkey
  foreign key (component_id) references public.ingredients(id) on delete cascade;
