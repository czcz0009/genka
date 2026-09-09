import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "原価計算・値付けツール",
  description: "個人飲食店向けの原価計算・メニュー値付けMVP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          ナビゲーションのリンクは全ページ共通で常に表示される。Next.jsの<Link>は
          既定でビューポート内に入ると裏側でリンク先のRSCペイロードを丸ごと
          プリフェッチする(=リンク先ページのSupabaseクエリを含む処理が丸ごと
          実行される)ため、ここに素のLinkを並べると「ページを1つ開くだけで
          ナビの全リンク先ページ分のクエリが裏で毎回走る」状態になり、
          サーバー・Supabaseへの負荷が実際のアクセス頻度の何倍にも膨らんでいた
          (優先度3のパフォーマンス調査で実際にネットワークログを確認して判明)。
          ここは「よく使うページへのショートカット」であって「次に開く可能性が
          高いページの先読み」ではないため、prefetchを明示的に無効化する。
        */}
        <nav className="border-b border-black/10 px-6 py-3 text-sm dark:border-white/10">
          <div className="mx-auto flex max-w-4xl items-center gap-5">
            <Link href="/" prefetch={false} className="font-semibold">
              原価計算ツール
            </Link>
            <Link href="/menus" prefetch={false} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              原価計算
            </Link>
            <Link href="/import" prefetch={false} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              CSV取り込み
            </Link>
            <Link href="/ranking" prefetch={false} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              収益ランキング
            </Link>
            <Link
              href="/fl-ratio"
              prefetch={false}
              title="FL比率(食材原価+人件費が売上に占める割合)"
              className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              FL比率
            </Link>
            <Link href="/alerts" prefetch={false} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              仕入れ値アラート
            </Link>
            <Link
              href="/settings"
              prefetch={false}
              aria-label="店舗設定"
              title="店舗設定"
              className="-my-2 -mr-2 ml-auto shrink-0 rounded-lg p-2 text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
