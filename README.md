# 原価計算・メニュー値付けツール(MVP)

個人経営の飲食店主向け。レシピ単位の原価計算と、仕入れ値変動を検知して知らせるツール。

## 現在の状況

- ✅ **① レシピ・仕入れデータの取り込み(CSV/Excel + マッピング推測)** — 実装済み。認証込みで実際にSupabaseへ保存されるところまで実機確認済み
- ✅ **③ メニュー別収益貢献度ランキング** — 実装済み(`/ranking`)。販売数量の手動入力・CSV取り込み、値上げ目安額の算出込み
- ✅ **FL比率・FLR比率アラート** — 実装済み(`/fl-ratio`)。固定費(家賃・人件費)の登録、月次推移の折れ線グラフ込み
- ✅ **② 仕入れ値変動の検知とアラート(市場データ連携)** — 実装済み(`/alerts`)。
  農水省「青果物卸売市場調査(旬別結果)」(野菜・果物)と「畜産物卸売価格の推移」
  (豚・牛各規格・鶏肉もも/むね)の2つの市場データを変動シグナルとして使い、
  影響を受けるメニューの試算原価率と通知文を生成する。定期取得は
  `src/app/api/cron/**`(Vercel Cron想定、`vercel.json`にスケジュール設定済み)。
  畜産物は規格が曖昧なため、`/alerts`画面で食材ごとに対応する規格を店主が
  明示的に確定させる方式(自動マッチングはしない)

認証はSupabase Auth(メール+パスワード)。ログイン初回にstoreを自動作成する(MVPは1ユーザー1店舗)。

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:3000/import` からCSV/Excel取り込みを試せます。ナビゲーションから
`/ranking`(収益ランキング)・`/fl-ratio`(FL比率)・`/alerts`(仕入れ値アラート)にも
遷移できます。

### Supabaseを接続する場合

1. https://supabase.com でプロジェクトを作成
2. `supabase/migrations/` 配下のSQLファイルを**番号順に**SQL Editorで実行
   (0001〜0006。テーブル・RLSポリシーが作成されます)
3. `.env.local.example` を `.env.local` にコピーし、プロジェクトのURL・anon keyを設定
   (**secret key/service_roleキーは`.env.local.example`には書かないこと** —
   `NEXT_PUBLIC_`プレフィックスを付けるとブラウザに公開されてしまう。通常のページ・
   Server Actionはanon keyのみで動く設計)
4. 開発中にメール確認なしでログインしたい場合は、Authentication > Providers > Email の
   「Confirm email」を一時的にOFFにする(**本番運用では必ず戻すこと**)

未接続の間もCSV取り込み〜マッピング確認〜確定内容のプレビューまでは動作します(DB保存だけ未実装)。

### 仕入れ値アラートの定期取得(cron)を有効にする場合

`market_price_observations` / `livestock_price_observations` は店舗非依存の公開参考
データで、通常ユーザー向けの書き込みポリシーをあえて用意していない
(RLSを無視できるservice roleからのみ書き込み可能)。そのため定期取得ジョブには
追加で環境変数が必要:

1. `.env.local` に `SUPABASE_SERVICE_ROLE_KEY`(Project Settings > API)と、
   任意のランダム文字列 `CRON_SECRET` を追加(`.env.local.example`のコメント参照。
   **どちらも`.env.local.example`やコミット対象のファイルには書かないこと**)
2. Vercelにデプロイする場合は、同じ `CRON_SECRET` の値をVercelのプロジェクト環境変数にも設定する
3. `vercel.json` の `crons` が自動的にスケジュール実行する(青果物は月3回、畜産物は月1回。
   スケジュールの根拠は各ルートハンドラのコメント参照)
4. 手動で1回試す場合: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/collect-produce-prices`

## テスト

マッピング推測ロジックなど、Reactに依存しない純粋関数はNode標準の `node:test` でテストしています。

```bash
npm test
```

## 技術スタック

Next.js (App Router) / TypeScript / Tailwind CSS / Supabase(認証・DB、接続時) / Vercelデプロイ想定

## 設計メモ

- **重複登録の防止**: 食材名・メニュー名は表記ゆれを吸収した正規化キー
  (`src/lib/normalize.ts`)で店舗内一意にする。DB側にも `UNIQUE(store_id, normalized_name)`
  制約を張っており(`supabase/migrations/0001_init.sql`)、アプリのバグとDB制約の二重で
  重複登録を防ぐ設計にしている。類似アプリで報告されている重複バグを踏まえた対策。
- **列マッピング推測**: LLM APIは使わず、同義語辞書 + 文字列類似度(bigram Dice係数) +
  セル内容(数値か・単位らしいかの言語外シグナル)を組み合わせたルールベース。
  外部API費用ゼロ・低レイテンシで動き、`src/lib/mapping/` に将来LLM版へ差し替え
  可能な形で切り出してある。マッピングは常にユーザーが確認・修正してから確定する
  (自動確定はしない)。名前の手がかりが皆無な列を内容だけで断定しないよう、
  自動選択の閾値は「内容スコアの重み(0.3)だけでは絶対に超えられない」0.5に設定している。

- **仕入れ値変動アラート(市場データ連携)**: 農水省「青果物卸売市場調査(旬別結果)・
  主要卸売市場計」のCSV(`https://www.maff.go.jp/j/tokei/syohi/shunbetu/...`)を月3回
  (上旬・中旬・下旬)取得し、前回旬との価格変動率を検知する。データソース選定にあたり
  利用規約・robots.txtを確認済み(検索フォームの `seisen.maff.go.jp` はrobots.txtで
  全面禁止のため対象外にし、静的CSVが置かれている `www.maff.go.jp` 側 — robots.txt
  自体が存在しない — を使っている)。
  - 文字コードはShift_JIS。Node標準の`TextDecoder("shift_jis")`でデコードでき、
    追加ライブラリは不要。
  - 対象期間がまだ未公表の場合、404ではなく**403**が返ることを実データで確認済み。
    どちらも「未公表」として扱い、エラーにせずスキップする(`fetchSyuyoCsv.ts`)。
  - 店主の食材名(「じゃがいも」等)とCSVの正式な品目名(「ばれいしょ」等)は
    文字の重なりがなく類似度計算だけでは突き合わせられないため、①のロジック
    (`headerMatchScore`)を流用しつつ、まず同義語辞書(`itemAliases.ts`)で
    突き合わせ、辞書にない場合だけ類似度によるフォールバック(確信度low、
    通知には使わず要確認候補として返すのみ)にしている。
  - 通知内容は「実際に仕入単価を変更した結果」ではなく「市場価格の変動率が
    店主の現在の仕入単価にもそのまま反映されたと仮定した場合の試算」である
    ことを明示している(仕入契約は市場と連動するとは限らないため)。
  - このデータソースは青果物(野菜・果物)限定。米・肉・魚・調味料・穀物加工品
    (小麦粉等)は対象外(→畜産物は下記の別データソースでカバー)。
  - 実際にCSVを取得し、実データを固定したテストフィクスチャ
    (`src/lib/marketPrices/fixtures/26073h_syuyo.csv`)を使ってパーサ・
    マッチング・アラート生成を一気通貫でテストしている。

- **仕入れ値変動アラート(畜産物: 豚・牛・鶏肉)**: 農水省「畜産物卸売価格の推移
  (月報告)」(`src/lib/marketPrices/livestock/`)。ファイル名が日付から機械的に
  組み立てられない(`index-{連番}.pdf`)ため、一覧ページ
  (`https://www.maff.go.jp/j/chikusan/shokuniku/lin/`)を都度スクレイピングして
  タイトルに「月報告」を含むリンクを探す(同じセクションに月報告以外のPDF
  ―グラフ画像や別調査―も並んでいるため、タイトルでの絞り込みが必須)。
  - PDFはテキスト抽出可能だが、**システムのpdftotext(poppler)は日本語を
    一切抽出できなかった**(CJK用CMapデータ不足)。`pdfjs-dist`に切り替えて
    解決している。
  - 見出しが4段に重なった結合見出しで、しかも一部のラベル(「成牛」等)は
    位置情報だけでは対応する列を一意に決められないことを実データで確認した。
    列の意味(品目)自体は月ごとに変わらない固定フォーマットである前提を置き、
    「どの数値がどの列か」は数値セルの右端(x+width)を毎回クラスタリングして
    機械的に検出し(桁数が変わっても右揃えなので右端は安定する)、「その列が
    何を意味するか」は固定カタログ(`chikusanColumns.ts`)で持たせる設計にした
    (見出しテキストの自動再構成は行わない)。検出列数が想定と違えば
    レイアウト変化とみなしエラーを返す。
  - 月次比較に必要な「今回分」「前回分」は、実は同じPDF1枚に複数月分の
    サマリー行が含まれているため、別ファイルを持ち出さずその場で両方取り出せる
    (`monthlyComparison.ts`)。
  - 部位・規格の曖昧さ(「豚肉」「牛肉ロース」等の登録だと、どの規格の価格に
    対応するか一意に決まらない)があるため、①②の青果物と違い**自動マッチング
    はしない**。`suggestChikusanItem.ts`は初回登録時のプルダウン候補を
    提案するだけで、実際にアラート対象になるのは店主が明示的に確定させた
    リンク(`ingredient_market_links`テーブル、`confirmedLinksToMatches.ts`)のみ。
  - `detectPriceChanges.ts`・`generateAlerts.ts`は青果物用に書いたものを
    一切変更せずそのまま流用できている(畜産物データを共通の`SyuyoItem`型に
    変換するアダプタ`toMarketItems`を挟むだけ)。
  - 実際にPDF・一覧ページを取得し、固定したテストフィクスチャ
    (`src/lib/marketPrices/livestock/fixtures/`)を使ってパーサ・列検出・
    アラート生成を一気通貫でテストしている。
  - **`pdfjs-dist`はNext.js(Turbopack)のRoute Handlerから呼ぶと動かなかった**:
    pdfjs-distは内部で`await import(workerSrc)`によりworkerを動的に読み込むが、
    Turbopackはwebpack向けの`webpackIgnore`コメントを無視してこの動的importまで
    書き換えてしまい、パス解決に失敗する(`serverExternalPackages`でバンドル対象から
    外しても解消しなかった)。単体のNodeスクリプトでは問題なく動いていたため、
    Route Handler経由で初めて再現した不具合。pdfjs-dist自身がバンドラ環境向けに
    用意している回避策(worker本体を静的importし`globalThis.pdfjsWorker`に登録する
    — pdf.mjs内の`#mainThreadWorkerMessageHandler`が最優先でこれを見に行く)を
    使うことで解決している(`parseChikusanPdf.ts`)。

- **メニュー別収益貢献度ランキング**(`src/lib/menuRanking.ts`): 「原価率」ではなく
  「販売数量 ×(売価-原価)」の利益貢献度で降順ランキングする。売価未設定などで
  計算できないメニューは末尾に回し、エラーにはしない。目標原価率を超えたメニューには
  `calcSuggestedPriceIncrease`(`src/lib/costCalc.ts`)で「+◯円が目安」を算出する
  (必要売価まで切り上げるため、提示額どおり値上げすれば必ず目標を達成できる)。
  販売数量は手動入力・CSV取り込みの両方に対応(CSV取り込みは①のマッピングエンジンを
  汎用化して流用 — `mapping/fields.ts`の`FieldDef`を型パラメータ化し、
  `salesImport/salesFields.ts`という別のフィールド定義セットで同じロジックを使い回している)。
  日別内訳のCSVでも、同じメニュー名の行は対象期間の合計として自動集計する。

- **FL比率・FLR比率**(`src/lib/flRatio.ts`): 家賃(継続的な値、`period_end`を
  nullにできる)と人件費(月次で都度入力)を`store_fixed_costs`に保存し、
  対象月に適用される値を`selectApplicableFixedCost`(期間が重なる行のうち
  最新の`period_start`を採用)で選ぶ。F/L/FL/FLRを個別に算出し、業界目安
  (FL60%・FLR70%)を超えた場合のみ「注意」「危険」の機械的な段階表示をする
  (原因の解釈・改善提案はしない)。月次推移グラフは外部チャートライブラリなしの
  インラインSVGで実装、dataviz skillの検証スクリプトでCVD安全性を確認した配色
  (`node scripts/validate_palette.js "#2a78d6,#eb6834"` → 両モードPASS)を使用。
  過去月の食材原価は現在の仕入単価で再計算した参考値である旨をUIに明記している
  (当時の実際の仕入単価の履歴は保持していないため)。
