import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
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
  title: "原価計算・値付けツール",
  description: "個人飲食店向けの原価計算・メニュー値付けMVP",
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
