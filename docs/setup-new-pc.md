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
   - `CRON_SECRET`(同上)
   - これらの値は、Supabaseダッシュボード(Project Settings > API)からも
     いつでも再取得できる

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

新しいPCで作業する前に、`supabase/migrations/`フォルダの中身と、実際に
Supabase側で最後まで実行したファイル(このファイルより番号が新しいものが
無いか)を見比べておくと安心。特に直近追加した
`0017_menu_price_history.sql` は、実行済みかどうか要確認。

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
- Vercelに新しいPCから直接デプロイしたい場合は、そのPCで別途
  `vercel link` が必要(通常はGit連携で自動デプロイされるため、
  この作業は基本的に不要)
