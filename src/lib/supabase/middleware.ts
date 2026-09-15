import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./env.ts";

/**
 * ブラウザ・中間キャッシュに一切キャッシュさせない(全ページ共通)。
 *
 * 背景(配布前QAで発見): ログインが必要な画面を表示→ログアウト→ブラウザの「戻る」ボタン、
 * という操作をした場合、Next.js自体は毎回サーバー側で描画し直す(動的レンダリング)ものの、
 * レスポンスヘッダーに Cache-Control: no-store が付いていないと、ブラウザのbfcache(ページ全体を
 * メモリ上に保持する機能)によって「戻る」操作時にサーバーへ再度問い合わせず、ログアウト前の
 * 画面がそのまま(JSも再実行されずに)復元されてしまう可能性がある。飲食店の共有端末での
 * 利用を想定しているため、これを明示的に防ぐ。
 */
function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Supabaseの認証セッションCookieを、リクエストのたびにリフレッシュする。
 * @supabase/ssr の推奨パターン(Server Component自体はCookieを書き込めないため、
 * proxy.ts側で毎回リフレッシュしておく必要がある)。
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return withNoStore(response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getUser()を呼ぶことでセッションが期限切れなら更新される(Cookieの書き込みは上のsetAllで発生)
  await supabase.auth.getUser();

  return withNoStore(response);
}
