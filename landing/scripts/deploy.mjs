// LP(landing/)を Vercel の genkaru-lp プロジェクトへ公開する。
//   node scripts/deploy.mjs          … ビルド → 公開(本番)
//   node scripts/deploy.mjs --dry    … 公開の直前まで(リンク確認のみ。公開はしない)
//
// dist/ の中で `vercel link` を実行すると、Vercelのトークン入りの .env.local が
// 公開物に混ざる恐れがあるため、必ず一時フォルダにコピーしてから行う。
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dry = process.argv.includes("--dry");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

run("pnpm build");
const tmp = mkdtempSync(join(tmpdir(), "genkaru-lp-"));
try {
  cpSync("dist", tmp, { recursive: true });
  run("npx vercel link --project genkaru-lp --yes", tmp);
  const envFile = join(tmp, ".env.local");
  if (existsSync(envFile)) rmSync(envFile);
  if (dry) {
    console.log("\n[dry] リンクまで成功。公開はしていません。対象:", tmp);
  } else {
    run("npx vercel --prod --yes", tmp);
  }
} finally {
  // Windowsでは直前のプロセスがフォルダを掴んで消せないことがある。
  // トークン入りの .env.local は上で削除済みなので、失敗しても警告だけにする。
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    console.warn("一時フォルダを削除できませんでした(無害です。手動で消して構いません):", tmp);
  }
}
