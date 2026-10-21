import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { SERVICE_NAME } from "@/lib/serviceName.ts";
import { APP_URL } from "@/lib/siteUrl.ts";
import "./globals.css";

// design-reference(Figma Make案)と同じフォント構成。next/fontで自前ホスティングし、
// 外部CDNへの都度リクエストを避ける(参考実装はGoogle FontsのCDNから直接読み込む
// 構成だったが、パフォーマンス上の理由でこちらの方式を採用)。
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${SERVICE_NAME} | 飲食店向け原価計算・値付けツール`, template: `%s | ${SERVICE_NAME}` },
  description: `個人飲食店向けの原価計算・メニュー値付けツール「${SERVICE_NAME}」`,
  metadataBase: new URL(APP_URL),
  // アプリの画面は検索結果に出さない(ログイン後の画面・ログイン画面とも)。
  // 例外は利用規約・プライバシーポリシー・特商法表示の3ページで、各ページ側で index を指定している。
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJP.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col">{children}</body>
    </html>
  );
}
