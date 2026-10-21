/**
 * アプリの正規URL(末尾スラッシュなし)。canonical・robots.txt・sitemap.xml に使う。
 * 旧URL(genka-one.vercel.app)からのアクセスも、検索エンジンにはこちらを正規として伝える。
 */
export const APP_URL = "https://app.genka-lens.com";

/** 検索結果に出してよい(ログイン不要の)ページ。これ以外は全画面 noindex(src/app/layout.tsx)。 */
export const PUBLIC_PATHS = ["/terms", "/privacy", "/legal"] as const;
