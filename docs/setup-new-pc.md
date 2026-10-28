# 別PCで作業を始めるための手順

このリポジトリ(原価計算・メニュー値付けツール)を、今使っているPC以外の
PCでも開発できるようにするための手順。Supabase自体は共有のクラウド
プロジェクトなので、「新しいSupabaseを作る」作業は不要(今のPCと同じ
プロジェクトに、別のPCから繋ぎに行くだけ)。

## 1. 事前に必要なもの

- Node.js(現在の開発PCは v22.14.0 / npm 10.9.2 で動作確認済み。厳密に
  同じバージョンでなくても大きな問題は無いはずだが、大きく古いバージョンは避ける)
- Git
- GitHubアカウントでこのリポジトリ(`https://github.com/czcz0009/genka`)への
  アクセス権
- Claude Codeを使う場合はそのセットアップ(CLAUDE.mdはリポジトリに含まれて
  いるので、cloneした時点で自動的に読み込まれる。追加設定は不要)

## 2. リポジトリを取得する

```bash
git clone https://github.com/czcz0009/genka.git
cd genka
npm install
```

## 3. 環境変数(.env.local)を用意する

`.env.local` は秘密情報を含むため**gitには含まれていない**。新しいPCでは
自分で作り直す必要がある。

1. `.env.local.example` を `.env.local` にコピーする
2. 以下の値を埋める(今使っているPCの `.env.local` から、信頼できる方法
   —例えば1Password等のパスワード管理ツールやUSBメモリ経由— でコピーする。
   チャットやメール本文にそのまま貼り付けない):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`(定期取得ジョブ用。無くてもアプリ本体は動く)
   - `CRON_SECRET`(同上。48文字。Vercelの本番と同じ値)
   - `ANTHROPIC_API_KEY`(納品書の読み取り。**ワークスペース指定のキー**でないと400エラー)
   - `OCR_DB_TOKEN`(読み取りの回数の関数を守る合言葉。本番と同じ値)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`(画像認証のテスト用のキー。公開してよい値)
   - Supabaseの3つは、Supabaseダッシュボード(Project Settings > API)からも
     いつでも再取得できる。`CRON_SECRET`・`OCR_DB_TOKEN` はVercelでは値を読めない(sensitive)ので、
     **旧PCの `.env.local` からコピーする**(無くしたら作り直す。HANDOFF.md の5-5・cronの項)
   - **一番かんたんなのは、旧PCの `.env.local` をファイルごと、USBメモリかパスワード管理ツールで移すこと。**
     チャット・メール・Claude Codeの画面に値を貼らない

## 4. 動作確認

```bash
npm run dev
```

`http://localhost:3000` にアクセスして、いつも通りログインできれば
Supabase接続は成功。念のため以下も一度流しておくと安心:

```bash
npm run build
npm run lint
npm test
```

## 5. Supabase(DBマイグレーション)について

Supabaseは1つの共有プロジェクトなので、**マイグレーションの適用はPCごとに
行うものではない**。今のPCで既に`supabase/migrations/`配下のSQLを
SQL Editorで実行済みなら、新しいPCから接続してもそのまま同じデータが見える。

何番まで適用済みかは、SQL Editorで `supabase/checks/migration_log_status.sql` を実行して確かめる
(DBの記録の表 `migration_log` を見る。HANDOFFの記述よりこちらが正)。**2026-10-28時点で0032まで適用済み**。

## 6. 2台のPCで作業する時の注意

- 作業を始める前に必ず `git pull` してから始める(古い状態のまま編集すると
  コンフリクトの原因になる)
- 作業が終わったら `git push` を忘れない(pushし忘れたまま別PCで作業を
  始めると、後で同じファイルの変更が衝突しやすい)
- 同時に2台のPCで同じ機能を並行して触らない(Claude Codeでの自律的な
  実装作業は特に、片方のPCで一区切りついてpushしてから、もう片方を
  始めるのが安全)

## 7. その他、PCごとに個別設定が必要なもの

- Claude Codeの権限設定(`.claude/settings.local.json`)はPCごとの
  ローカル設定で、gitには含まれない。新しいPCでは、最初は今まで許可した
  コマンドの確認が再度求められることがあるが、想定通りの挙動なので問題ない
- **本番へのデプロイは手動**(`git push` だけでは反映されない)。新しいPCで
  `npx vercel login` → `npx vercel link --project genka --yes` をした上で、
  `npx vercel --prod` を実行する。詳しくは [HANDOFF.md](HANDOFF.md) を参照
- LP(`landing/`)は別のVercelプロジェクト(`genkaru-lp`)。手順は HANDOFF.md の5-2

## 8. 2026-10-28の移行で追加したこと(旧PCから新PCへ)

### 8-1. 旧PCから移すもの(gitに入っていないもの)
| もの | 場所(旧PC) | 移し方 |
|---|---|---|
| `.env.local` | リポジトリの直下 | USBメモリ・パスワード管理ツール(チャットに貼らない) |
| デモ・旬報・PR動画のフォルダ | `C:\Users\tarutani.mahiro\genka-demo\`(15MB) | フォルダごとコピー。中身: `pr-demo-login.txt`(PR用アカウントのログイン情報。**秘密**)、`旬報\`(下書き)、`pr-video-20261026\`(PR動画)、`テスト用\`(iPhoneで試す納品書の画像・PDF) |
| Vercelのつなぎ情報 | `.vercel/`・`landing/.vercel/` | 移さなくてよい。新PCで `npx vercel login` → `npx vercel link --project genka --yes`、`landing` で `npx vercel link --project genkaru-lp --yes` |

### 8-2. 新PCで入れるもの
```bash
npm install                                   # Playwright 1.63.0・pglite も入る(devDependencies)
npx playwright install chromium               # 画面確認・PR動画のスクリプト用のブラウザ
cd landing && npx -y pnpm install --frozen-lockfile   # LP(公開は npx -y pnpm ship)
```
- PR動画を組み立て直すときだけ ffmpeg(`winget install Gyan.FFmpeg`)
- テストは `npm test`(2026-10-28時点で625本、すべてPASS)

### 8-3. 手元でログインするとき(画像認証をオンにした後)
- 2026-10-28にSupabase側の画像認証をオンにしたため、手元(テスト用のサイトキー)のログイン画面では、
  **パスワードを入れても入れない**(Supabaseがテスト用の画像認証の結果を断る)。
- スクリプトでの画面確認は `scripts/qa/adminLogin.mjs`(管理者の機能でログイン状態を作ってcookieに入れる。
  使い捨てアカウント `tmp-demo-` だけ)。使い方: `import { adminLogin } from "./scripts/qa/adminLogin.mjs";`
  → `await adminLogin(context, email, "http://localhost:3100");` を `node --env-file=.env.local` で動かす。
- 手で画面を触りたいときの案(未実施・Mahiroが判断): Cloudflareの管理画面で、Turnstileのウィジェットの
  「ホスト名」に `localhost` を足し、手元の `.env.local` を本物のサイトキーにする。または本番で確かめる。

### 8-4. 旬報の下書き(タスクスケジューラ)
- 旧PCのタスクスケジューラ「原価レンズ\旬報の下書き」(毎朝8:00)は、**旧PCが起きているときだけ動く**。
- 新PCに移すときは、HANDOFF.md の「旬報」の項の手順で、`scripts/shunpo/run_shunpo.cmd` の node の場所を
  新PCに合わせてから登録し、旧PCの登録を消す(両方で動いても害はないが、下書きが2か所にできる)。
- 毎朝8:00には、読み取りでAI側の都合の失敗が無かったかの確認(`scripts/ops/check_ocr_incidents.mjs`)も一緒に動く。
