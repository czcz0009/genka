// 合言葉 OCR_DB_TOKEN を作り直す(2026-10-27)。値は画面・ログに出さない。
//   node scripts/ops/rotate_ocr_token.mjs
// 1. 新しい値(48文字)を作り、手元の .env.local の OCR_DB_TOKEN に書く
// 2. Vercelの本番の環境変数 OCR_DB_TOKEN を、読めない種類(sensitive)で上書きする(値は標準入力で渡す)
// 3. DBに入れる要約(SHA-256の16進)と、そのSQLだけを画面に出す(要約から値は戻せない)
// このあと、SQL Editorで要約のSQLを当て、再デプロイする(HANDOFF.md 5-5)。
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const VERCEL = process.env.VERCEL_CLI ?? "npx vercel";
const token = randomBytes(36).toString("base64url");
const f = ".env.local";
let t = readFileSync(f, "utf8");
t = /^OCR_DB_TOKEN=.*$/m.test(t) ? t.replace(/^OCR_DB_TOKEN=.*$/m, `OCR_DB_TOKEN=${token}`) : t.replace(/\s*$/, "\n") + `OCR_DB_TOKEN=${token}\n`;
const [cmd, ...args] = VERCEL.split(" ");
const r = spawnSync(cmd, [...args, "env", "add", "OCR_DB_TOKEN", "production", "--force", "--sensitive"], { input: token, shell: true, encoding: "utf8" });
if (r.status !== 0) {
  console.error("Vercelへの登録に失敗しました。.env.local は変えていません。");
  process.exit(1);
}
writeFileSync(f, t);
const hex = createHash("sha256").update(token, "utf8").digest("hex");
console.log("Vercelの本番と .env.local に、新しい合言葉(48文字)を入れました。");
console.log("DBの要約を差し替えるSQL(SQL Editorで実行):");
console.log(`insert into public.app_server_tokens (name, token_sha256, updated_at) values ('ocr', decode('${hex}', 'hex'), now()) on conflict (name) do update set token_sha256 = excluded.token_sha256, updated_at = now();`);
