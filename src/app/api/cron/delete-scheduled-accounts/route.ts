import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createServiceClient } from "@/lib/supabase/serviceClient";

/**
 * 退会(アカウント削除)の猶予期間(30日、account_deletion_requests)が過ぎた
 * ユーザーを、実際に削除する定期ジョブ。毎日1回、Vercel Cronから呼ばれる想定。
 *
 * auth.admin.deleteUser()はauth.usersの行を削除し、店舗・食材・メニュー等の
 * 関連データはすべてON DELETE CASCADEで連鎖的に削除される(0022マイグレーションで
 * prep_item_components.component_idもCASCADEに変更済み。仕込み品の材料として
 * 使われている食材があっても削除は成功する。使い捨てアカウントで実際に確認済み)。
 * account_deletion_requests自体もuser_idにON DELETE CASCADEが張ってあるため、
 * 削除に成功すれば申請の行も自動的に消える(後片付け不要)。
 *
 * 1件の削除に失敗しても他の対象の処理は止めない(try/catchで個別に処理し、
 * 結果をまとめて返す。失敗はVercelのログで確認する)。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "service role が未設定です" }, { status: 500 });
  }

  const { data: due, error: fetchError } = await supabase
    .from("account_deletion_requests")
    .select("user_id, scheduled_for")
    .lte("scheduled_for", new Date().toISOString());
  if (fetchError) {
    return NextResponse.json({ status: "error", step: "fetch", detail: fetchError.message }, { status: 500 });
  }

  const results: { userId: string; status: "deleted" | "failed"; detail?: string }[] = [];
  for (const row of due ?? []) {
    const { error } = await supabase.auth.admin.deleteUser(row.user_id);
    if (error) {
      console.error("[delete-scheduled-accounts] failed to delete user", row.user_id, error.message);
      results.push({ userId: row.user_id, status: "failed", detail: error.message });
    } else {
      results.push({ userId: row.user_id, status: "deleted" });
    }
  }

  return NextResponse.json({
    status: "done",
    targetCount: due?.length ?? 0,
    deletedCount: results.filter((r) => r.status === "deleted").length,
    failedCount: results.filter((r) => r.status === "failed").length,
    results,
  });
}
