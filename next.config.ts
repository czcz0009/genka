import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist は実行時にworkerファイルを動的importで読み込むが、Turbopack/webpackで
  // バンドルされるとそのファイルレイアウトが崩れて解決できなくなることを実際に確認した
  // (畜産物PDF取り込みのRoute Handlerで再現)。バンドル対象から外し、素のNode.js requireで
  // 解決させることで、単体のNodeスクリプトで動いていたときと同じ挙動にする。
  // heic-decode(libheif-js)も、WebAssemblyを含む大きな部品なのでバンドルしない(納品書のHEICの読み取り。2026-10-26)。
  serverExternalPackages: ["pdfjs-dist", "heic-decode", "libheif-js"],

  // サーバーアクションが受け取れる大きさの上限(初期設定1MB)。納品書の写真はブラウザで縮小してから送るが、
  // 縮小できない形式(AndroidのHEIC等)をそのまま送る場合の予備として4MBにする(広げすぎない)。2026-10-27
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },

  // 旧URL(genka-one.vercel.app)から独自ドメインへの恒久的な転送(301)。
  // /api/ は転送しない: Vercelのcronは本番の *.vercel.app のURLを呼び、転送には従わない
  // (Vercel公式ドキュメント「Cron jobs and redirects」)。転送するとcronが止まるため。
  async redirects() {
    return [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "genka-one.vercel.app" }],
        destination: "https://app.genka-lens.com/:path",
        statusCode: 301,
      },
    ];
  },
};

export default nextConfig;
