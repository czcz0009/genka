"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./env.ts";

/**
 * ブラウザ用Supabaseクライアント。
 * 環境変数が未設定の間(MVP初期段階でSupabaseプロジェクトをまだ作っていない間)は
 * null を返す。呼び出し側は null チェックして「保存は未設定」を案内すること。
 */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
