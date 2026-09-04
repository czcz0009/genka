import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./env.ts";

/**
 * Supabaseの認証セッションCookieを、リクエストのたびにリフレッシュする。
 * @supabase/ssr の推奨パターン(Server Component自体はCookieを書き込めないため、
 * proxy.ts側で毎回リフレッシュしておく必要がある)。
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

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

  return response;
}
