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
        <nav className="border-b border-black/10 px-6 py-3 text-sm dark:border-white/10">
          <div className="mx-auto flex max-w-4xl items-center gap-5">
            <Link href="/" className="font-semibold">
              原価計算ツール
            </Link>
            <Link href="/import" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              CSV取り込み
            </Link>
            <Link href="/ranking" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              収益ランキング
            </Link>
            <Link href="/fl-ratio" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              FL比率
            </Link>
            <Link href="/alerts" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              仕入れ値アラート
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
