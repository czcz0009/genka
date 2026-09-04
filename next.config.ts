import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist は実行時にworkerファイルを動的importで読み込むが、Turbopack/webpackで
  // バンドルされるとそのファイルレイアウトが崩れて解決できなくなることを実際に確認した
  // (畜産物PDF取り込みのRoute Handlerで再現)。バンドル対象から外し、素のNode.js requireで
  // 解決させることで、単体のNodeスクリプトで動いていたときと同じ挙動にする。
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
