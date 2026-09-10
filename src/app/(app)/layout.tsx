import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar.tsx";

/**
 * ログイン後の全画面(ダッシュボード・メニュー管理・CSV取り込み・収益ランキング・
 * FL比率・仕入れ値アラート・設定)に共通するサイドバー付きの外枠。
 * /login・/register はこのグループの外にあり、サイドバー無しの全画面レイアウトになる。
 *
 * 各ページ自身が持つ認証チェック・データ取得ロジックには一切手を入れていない
 * (ここはサイドバーに表示する店舗名を得るためだけの、追加的で軽量な取得)。
 * 未ログインの場合は各ページ側がそれぞれ/loginへリダイレクトするため、
 * ここではエラーにせず既定の店名を表示するだけに留める。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let storeName = "原価計算ツール";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const session = await getSessionStore(supabase);
    if (session.status === "ok") storeName = session.store.name;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row" style={{ background: "var(--background)" }}>
      <Sidebar storeName={storeName} />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
