// ビルド後に、LPの本文をHTMLとして dist/index.html に書き出す(プリレンダリング)。
// `pnpm build` の最後に自動で実行される。
// 目的: 本文(見出し・説明・FAQ)を、JavaScriptが動く前のHTMLに含めて、検索エンジン・SNSに読めるようにする。
import { build } from "vite";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

const outDir = resolve(".prerender-tmp");
await build({
  logLevel: "warn",
  build: { ssr: "src/entry-server.tsx", outDir, emptyOutDir: true },
});

try {
  const { render } = await import(pathToFileURL(join(outDir, "entry-server.js")).href);
  const html = render();
  const indexPath = resolve("dist/index.html");
  const template = readFileSync(indexPath, "utf8");
  const placeholder = '<div id="root"></div>';
  if (!template.includes(placeholder)) throw new Error(`dist/index.html に ${placeholder} が見つかりません`);
  writeFileSync(indexPath, template.replace(placeholder, `<div id="root">${html}</div>`));
  console.log(`プリレンダリング完了: 本文 ${html.length} 文字を dist/index.html に書き出しました`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
