// 使い捨てのデモアカウントを作る(営業用スクリーンショット・本番の画面確認用。HANDOFF 5-3)。
//
// 使い方: node --env-file=.env.local scripts/demo/seed_demo.mjs <パスワード>
//   メールアドレスは実行ごとに一意のもの(tmp-demo-日時-乱数@example.com)をこのスクリプトが作り、最後の行に出す。
//
// 途中で失敗したとき(2026-10-23):
// - 後片付けで消すのは、この実行で作ったアカウントだけ(名前の形で探して消すことはしない)。
//   店舗・食材・メニュー等は、アカウントを消すと一緒に消える(すべて on delete cascade)。
// - アカウントを作る要求を送った後に返事が戻らなかった場合は、この実行のメールアドレスで
//   アカウントを探し、見つかれば消す。
// - 後片付け自体が失敗したら、残ったアカウントのIDとメールアドレスをはっきり表示する。
// - 出力の全文は、実行のたびに一時フォルダのファイルに保存する(最後の行にファイルの場所を出す)。
//
// わざと失敗させる仕組み(後片付けの確認用。既定では無効):
//   環境変数 SEED_FAIL_AT に次のどれかを入れたときだけ、その段階で失敗させる。
//   before_user        … アカウントを作る前
//   after_user_request … アカウントを作る要求を送った後(返事が戻らなかったことにする)
//   after_store        … 店舗を作った後
//   mid_menu           … メニューの途中(1つ目のメニューを作った後)
//
// 作るデータの中身(環境変数 SEED_PRESET。既定は basic):
//   basic    … これまでと同じ「サンプル食堂」(画面確認・スクリーンショット用)
//   teishoku … 個人の定食屋「定食処 こはる亭」(PR動画用。今の本番の市場データで仕入れ値アラートが出る)
//   中身は scripts/demo/presets.mjs。市場価格のテーブルには何も書き込まない。
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRESETS } from "./presets.mjs";

const PRESET_NAME = process.env.SEED_PRESET || "basic";
const PRESET = PRESETS[PRESET_NAME];
// 利用規約の版は、アプリと同じ値を使う(src/lib/legalVersion.ts から読む)
const TERMS_VERSION = readFileSync(new URL("../../src/lib/legalVersion.ts", import.meta.url), "utf8").match(
  /TERMS_VERSION = "([^"]+)"/,
)?.[1];

/** "2026-09" → { period_start: "2026-09-01", period_end: "2026-09-30" } */
function monthPeriod(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { period_start: `${month}-01`, period_end: `${month}-${String(last).padStart(2, "0")}` };
}

const FAIL_POINTS = ["before_user", "after_user_request", "after_store", "mid_menu"];
const REQUEST_TIMEOUT_MS = 30000;

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const runId = `${stamp}-${randomBytes(3).toString("hex")}`;
const DEMO_EMAIL = `tmp-demo-${runId}@example.com`;
const DEMO_PASSWORD = process.argv[2];
const FAIL_AT = process.env.SEED_FAIL_AT || null;

const logDir = join(tmpdir(), "genka-seed-demo");
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `seed-${runId}.log`);

/** 画面に出し、同じ内容をログファイルにも書く(途中で落ちても、そこまでの出力は残る) */
function log(...parts) {
  const line = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  console.log(line);
  appendFileSync(logFile, line + "\n");
}

/** エラーを1行にする(複数行のオブジェクトのまま出すと、最後の行が「}」になって読めない) */
function oneLine(e) {
  if (!e) return "不明なエラー";
  const msg = e.message || String(e);
  const extra = [e.name, e.status, e.code].filter(Boolean).join("/");
  return (extra ? `${msg} (${extra})` : msg).replace(/\s+/g, " ");
}

function failIfRequested(point) {
  if (FAIL_AT === point) throw new Error(`わざと失敗させました(SEED_FAIL_AT=${point})`);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // 返事が戻らないまま止まり続けないよう、1回の要求は30秒で打ち切る
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }) },
});

function normalize(name) {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 作ったもの(後片付けの対象)。この実行で作ったものだけを入れる */
const created = { userId: null, storeId: null, userRequestSent: false };
let stage = "開始前";

/** この実行のメールアドレスと完全に一致するアカウントを探す(無ければ null) */
async function findUserByExactEmail(email) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  throw new Error("アカウントの一覧が多すぎて探しきれませんでした");
}

async function seed() {
  // 1. デモ用の使い捨てアカウントを作成(メール確認不要)
  stage = "アカウントの作成";
  failIfRequested("before_user");
  created.userRequestSent = true;
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  failIfRequested("after_user_request"); // 返事を受け取らなかったことにする(IDを記録する前に失敗)
  if (userErr) throw userErr;
  created.userId = userData.user.id;
  log("アカウントを作成:", created.userId);

  // 2. 店舗を作成(オンボーディング完了済み扱いにしてツアーを出さない)
  stage = "店舗の作成";
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .insert({
      owner_id: created.userId,
      name: PRESET.storeName,
      default_target_cost_rate: 30,
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (storeErr) throw storeErr;
  created.storeId = store.id;
  log("店舗を作成:", created.storeId);
  failIfRequested("after_store");

  // 3. 食材(今の単価=価格の履歴の最後の値)
  stage = "食材の作成";
  const ingredients = {};
  for (const ing of PRESET.ingredients) {
    const current = ing.history[ing.history.length - 1].price;
    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        store_id: created.storeId,
        name: ing.name,
        normalized_name: normalize(ing.name),
        unit: ing.unit,
        current_purchase_price: current,
        // 単価入力済みの印(0020で追加)。付けないと「単価未設定」扱いになり、全メニューが
        // 「計算できていません」と表示される。
        price_is_set: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    ingredients[ing.name] = { id: data.id, unit: ing.unit };
    // アプリで食材を登録・単価を変更した時と同じく、価格の履歴を作る(今見直すべきメニュー等の
    // 過去月の再現・値上げの影響額は、この履歴から単価・単価入力済みかどうかを判定するため)。
    const { error: historyError } = await supabase.from("ingredient_price_history").insert(
      ing.history.map((h) => ({ ingredient_id: data.id, price: h.price, price_is_set: true, recorded_at: `${h.at}T00:00:00Z` })),
    );
    if (historyError) throw historyError;
    // 食肉の規格への紐づけ(利用者が確定した紐づけとして保存。市場価格のテーブルには書かない)
    if (ing.livestockLink) {
      const { error: linkError } = await supabase
        .from("ingredient_market_links")
        .insert({ ingredient_id: data.id, source: "chikusan", item_code: ing.livestockLink });
      if (linkError) throw linkError;
    }
  }
  log("食材を作成:", String(PRESET.ingredients.length), "件");

  // 4. メニュー(レシピ・月ごとの販売数量)
  stage = "メニューの作成";
  for (const [i, menu] of PRESET.menus.entries()) {
    const { data: menuRow, error: menuErr } = await supabase
      .from("menus")
      .insert({
        store_id: created.storeId,
        name: menu.name,
        normalized_name: normalize(menu.name),
        selling_price: menu.sellingPrice,
      })
      .select("id")
      .single();
    if (menuErr) throw menuErr;
    const menuId = menuRow.id;

    for (const [ingredientName, quantity] of menu.lines) {
      const ing = ingredients[ingredientName];
      if (!ing) throw new Error(`メニュー「${menu.name}」の食材「${ingredientName}」が食材の一覧にありません`);
      const { error } = await supabase.from("menu_ingredients").insert({
        menu_id: menuId,
        ingredient_id: ing.id,
        quantity,
        unit: ing.unit,
      });
      if (error) throw error;
    }

    for (const [month, quantitySold] of Object.entries(menu.sales)) {
      const { error: salesErr } = await supabase.from("menu_sales").insert({
        menu_id: menuId,
        ...monthPeriod(month),
        quantity_sold: quantitySold,
      });
      if (salesErr) throw salesErr;
    }
    log(`メニューを作成(${i + 1}/${PRESET.menus.length}):`, menu.name);
    if (i === 0) failIfRequested("mid_menu");
  }

  // 5. 固定費(FL比率画面用)
  stage = "固定費の作成";
  for (const c of PRESET.fixedCosts) {
    const { error } = await supabase.from("store_fixed_costs").insert({
      store_id: created.storeId,
      cost_type: c.costType,
      amount: c.amount,
      period_start: c.periodStart,
      period_end: c.periodEnd,
    });
    if (error) throw error;
  }
  log("固定費を作成");

  // 6. 利用規約への同意(プリセットで指定したときだけ。ログイン直後に同意画面を出さないため)
  if (PRESET.consent) {
    stage = "同意の記録";
    const { error } = await supabase
      .from("user_consents")
      .upsert({ user_id: created.userId, terms_version: TERMS_VERSION, accepted_at: new Date().toISOString() });
    if (error) throw error;
    log("利用規約への同意を記録(版 " + TERMS_VERSION + ")");
  }
}

/**
 * 後片付け: この実行で作ったアカウントだけを消し、消えたことを確かめる。
 * 戻り値: { ok: true } または { ok: false, userId, reason }
 */
async function cleanup() {
  let userId = created.userId;
  // アカウントを作る要求を送ったが、IDを受け取れていない(返事が戻らなかった)場合は、この実行のメールで探す
  if (!userId && created.userRequestSent) {
    log("後片付け: アカウントのIDを受け取れていないため、この実行のメールアドレスで探します:", DEMO_EMAIL);
    const found = await findUserByExactEmail(DEMO_EMAIL);
    if (!found) {
      log("後片付け: このメールアドレスのアカウントは作られていませんでした(消すものなし)");
      return { ok: true };
    }
    userId = found.id;
    log("後片付け: 見つかりました:", userId);
  }
  if (!userId) {
    log("後片付け: アカウントはまだ作られていません(消すものなし)");
    return { ok: true };
  }

  const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
  if (delErr) return { ok: false, userId, reason: `アカウントの削除に失敗: ${oneLine(delErr)}` };

  // 消えたことを確かめる(アカウント・店舗。食材・メニュー等は店舗と一緒に消える)
  const stillUser = await findUserByExactEmail(DEMO_EMAIL);
  const { count: storeCount, error: countErr } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (countErr) return { ok: false, userId, reason: `削除の確認に失敗: ${oneLine(countErr)}` };
  if (stillUser || storeCount !== 0) {
    return { ok: false, userId, reason: `削除後も残っています(アカウント${stillUser ? 1 : 0}件・店舗${storeCount}件)` };
  }
  log(`後片付け: アカウント ${userId} を削除し、アカウント0件・店舗0件を確認しました`);
  return { ok: true };
}

async function main() {
  log(`実行ID ${runId} / メールアドレス ${DEMO_EMAIL} / データ ${PRESET_NAME}${FAIL_AT ? ` / わざと失敗させる段階: ${FAIL_AT}` : ""}`);
  if (!PRESET) {
    log(`結果: 失敗(SEED_PRESET の値が不明です: ${PRESET_NAME}。使える値: ${Object.keys(PRESETS).join(", ")})`);
    return 1;
  }
  if (PRESET.consent && !TERMS_VERSION) {
    log("結果: 失敗(src/lib/legalVersion.ts から利用規約の版を読めませんでした)");
    return 1;
  }
  if (!DEMO_PASSWORD) {
    log("結果: 失敗(パスワードを指定してください。使い方: node --env-file=.env.local scripts/demo/seed_demo.mjs <パスワード>)");
    return 1;
  }
  if (DEMO_PASSWORD.includes("@") || process.argv.length > 3) {
    log("結果: 失敗(引数はパスワード1つだけです。メールアドレスはこのスクリプトが実行ごとに作ります)");
    return 1;
  }
  if (FAIL_AT && !FAIL_POINTS.includes(FAIL_AT)) {
    log(`結果: 失敗(SEED_FAIL_AT の値が不明です: ${FAIL_AT}。使える値: ${FAIL_POINTS.join(", ")})`);
    return 1;
  }

  try {
    await seed();
  } catch (e) {
    log(`失敗: 段階「${stage}」で ${oneLine(e)}`);
    let result;
    try {
      result = await cleanup();
    } catch (e2) {
      result = { ok: false, userId: created.userId, reason: `後片付け中のエラー: ${oneLine(e2)}` };
    }
    if (result.ok) {
      log(`結果: 失敗(段階「${stage}」)。作りかけのアカウント・店舗は削除済み(残り0件) ログ=${logFile}`);
      return 1;
    }
    log("!!!!!!!!!!!!!!!! 後片付けに失敗しました。下のアカウントを手で削除してください !!!!!!!!!!!!!!!!");
    log(`!!! 残っているアカウント: ID=${result.userId ?? "(不明。メールアドレスで探してください)"} メールアドレス=${DEMO_EMAIL}`);
    log(`!!! 理由: ${result.reason}`);
    log(`結果: 失敗(段階「${stage}」)。後片付けにも失敗。残り: ID=${result.userId ?? "不明"} メール=${DEMO_EMAIL} ログ=${logFile}`);
    return 2;
  }

  log(`結果: 成功 userId=${created.userId} storeId=${created.storeId} email=${DEMO_EMAIL} ログ=${logFile}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    // ここに来るのは想定外(ログの書き込み失敗など)
    console.error(`結果: 想定外のエラー ${oneLine(e)} メール=${DEMO_EMAIL} ID=${created.userId ?? "不明"}`);
    process.exit(3);
  },
);
