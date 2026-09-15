"use client";

import Link from "next/link";

/**
 * requireAuthedClient()(src/lib/supabase/requireAuthedClient.ts)がセッション切れ時に
 * 返す文言と完全一致させている。ここが変わったらこちらも合わせて変える。
 */
const SESSION_EXPIRED_MESSAGE = "ログインが必要です";

/**
 * Server Actionのエラーをフォームの直下に表示する共通コンポーネント。
 *
 * 背景(配布前QAで発見): 従来は `{error && <p>{error}</p>}` のようにエラー文言を
 * そのまま出すだけで、セッション切れ(「ログインが必要です」)の場合でも
 * 再ログインへの導線が無く、ユーザーが詰んでしまっていた。この文言の時だけ
 * ログイン画面へのリンクを添える。
 */
export function ActionErrorMessage({ error }: { error: string }) {
  const isSessionExpired = error === SESSION_EXPIRED_MESSAGE;
  return (
    <p className="text-sm" style={{ color: "var(--status-danger)" }}>
      {error}
      {isSessionExpired && (
        <>
          {" "}
          <Link href="/login" className="underline underline-offset-2">
            ログイン画面へ
          </Link>
        </>
      )}
    </p>
  );
}
