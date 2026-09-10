import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./env.ts";

/**
 * Server Component / Server Action 用のSupabaseクライアント。
 * 認証Cookieの読み書きに対応するため @supabase/ssr の createServerClient を使う。
 * 環境変数が未設定なら null を返す(client.ts と同じ方針)。
 *
 * cache()でラップし、同一リクエスト内(例: (app)/layout.tsxと各ページの両方)
 * から呼ばれても同じクライアントインスタンスを再利用するようにしている。
 * これにより、getOrCreateStore側のcache()が「同じsupabaseインスタンス+同じuserId」
 * という条件で正しく重複排除できる(参照が毎回別インスタンスだとcache()が
 * 効かず、店舗取得のupsert+selectがナビゲーションのたびに二重実行されてしまう)。
 */
export const createClient = cache(async function createClient() {
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
});

/**
 * ログイン中のユーザーを取得する。
 *
 * これもcache()でラップしている理由はcreateClientと同じ:
 * (app)/layout.tsx(サイドバー表示のため認証確認が必要)と各ページの両方が
 * 同じリクエスト内でユーザー確認を行うようになり、supabase.auth.getUser()
 * (Supabase側にJWTの有効性を都度問い合わせる、ネットワークを伴う処理)が
 * ナビゲーションのたびに二重に走ってタブ切り替えが遅くなっていたため。
 */
export const getAuthUser = cache(async function getAuthUser(
  supabase: SupabaseClient | null,
): Promise<User | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
