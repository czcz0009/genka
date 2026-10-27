import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beginOcrAttemptWith, completeOcrSuccessWith, cancelOcrAttemptWith, type BeginResult, type RpcClient } from "./ocrGateCore.ts";

/**
 * 読み取りの回数の関数を呼ぶ入口(サーバー専用)。合言葉 OCR_DB_TOKEN は、サーバーの環境変数からだけ読む
 * (NEXT_PUBLIC_ を付けないので、ブラウザに渡るコードには入らない)。本体とテストは ocrGateCore.ts。
 * 呼び出しはログイン中の本人のクライアントで行う(管理者用の鍵は使わない)。
 */
const token = () => process.env.OCR_DB_TOKEN;
const asRpc = (supabase: SupabaseClient) => supabase as unknown as RpcClient;

export const beginOcrAttempt = (supabase: SupabaseClient): Promise<BeginResult> => beginOcrAttemptWith(asRpc(supabase), token());
export const completeOcrSuccess = (supabase: SupabaseClient, reservation: string) => completeOcrSuccessWith(asRpc(supabase), token(), reservation);
export const cancelOcrAttempt = (supabase: SupabaseClient, reservation: string, incident: "credit" | "auth" | "busy") =>
  cancelOcrAttemptWith(asRpc(supabase), token(), reservation, incident);
