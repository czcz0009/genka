import "server-only";
import { createClient } from "./server.ts";

export type AuthedClient =
  | { error: string }
  | { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; userId: string };

/** Server Actionの冒頭で使う共通の認証チェック。 */
export async function requireAuthedClient(): Promise<AuthedClient> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabaseが未設定です" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };
  return { supabase, userId: user.id };
}
