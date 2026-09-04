import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    // 静的アセット・画像最適化・favicon等はセッションリフレッシュ不要なので除外する
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
