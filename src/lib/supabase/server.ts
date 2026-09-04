import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./env.ts";

/**
 * Server Component / Server Action 用のSupabaseクライアント。
 * 認証Cookieの読み書きに対応するため @supabase/ssr の createServerClient を使う。
 * 環境変数が未設定なら null を返す(client.ts と同じ方針)。
 */
export async function createClient() {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component からの呼び出しではCookie書き込みができないため無視する。
            // (セッションのリフレッシュは proxy.ts / middleware 側で行う想定)
          }
        },
      },
    },
  );
}
