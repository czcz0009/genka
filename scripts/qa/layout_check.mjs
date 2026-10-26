// 表示崩れの自動確認(2026-10-26)。アプリの全画面とLPを、320px・375px・1280pxで開き、次を見つける。
//   - 横のはみ出し(ページ全体の横スクロール、画面の外にはみ出した要素。表など横スクロールの枠の中は除く)
//   - 文字の切れ(枠からはみ出して隠れた文字。「…」で省略しているものは「省略表示」として別に数える)
//   - 要素の重なり(文字・ボタン・入力欄どうしが重なっている)
//   - コンソールのエラー、ページのエラー、400番台・500番台の応答
//   - リンク切れ(アプリとLPの中のリンク。外部のサイトには問い合わせない)
//   - 通信が遅いときに、画面が出るか(375pxで主な画面だけ)
//
// 使い方(リポジトリのフォルダで):
//   node --env-file=.env.local scripts/qa/layout_check.mjs [--app https://app.genka-lens.com] [--lp https://www.genka-lens.com] [--out <フォルダ>] [--widths 320,375,1280] [--no-slow]
// - 使い捨てのデモアカウントを2つ作る(長い名前・長い案内文の入ったもの「long」と、メニュー・食材が0件の「empty」)。
//   作り方は scripts/demo/seed_demo.mjs(SEED_PRESET)。終わったら(途中で失敗しても)必ず削除し、0件を確かめる。
// - ログイン情報は画面にもファイルにも出さない。
// - 結果: <out>/report.md(一覧)、<out>/result.json、問題のあった画面の画像 <out>/shots/*.png
// - 本番に負荷をかけない: 画面は1つずつ順に開く(全部で百数十回の表示程度)。
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const APP = arg("app", "https://app.genka-lens.com");
const LP = arg("lp", "https://www.genka-lens.com");
const WIDTHS = arg("widths", "320,375,1280").split(",").map(Number);
const SLOW = !process.argv.includes("--no-slow");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const OUT = arg("out", join(tmpdir(), `genka-layout-check-${stamp}`));
mkdirSync(join(OUT, "shots"), { recursive: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** 使い捨てアカウントを作る(seed_demo.mjs)。メール・パスワードはこのプロセスの中だけで持つ */
function createAccount(preset) {
  const password = "Qa-" + randomBytes(12).toString("base64url");
  const out = execFileSync(process.execPath, ["--env-file=.env.local", "scripts/demo/seed_demo.mjs", password], {
    env: { ...process.env, SEED_PRESET: preset },
    encoding: "utf8",
  });
  const last = out.trim().split("\n").pop();
  const m = last.match(/userId=(\S+) storeId=(\S+) email=(\S+)/);
  if (!m) throw new Error(`デモアカウントを作れませんでした(${preset}): ${last.replace(/tmp-demo-\S+@example\.com/g, "(メール)")}`);
  return { preset, userId: m[1], email: m[3], password };
}
async function deleteAccount(acc) {
  const { data } = await admin.auth.admin.getUserById(acc.userId);
  if (!data?.user) return;
  if (!data.user.email?.startsWith("tmp-demo-")) throw new Error("削除しようとしたアカウントが使い捨てのものではありません");
  const { error } = await admin.auth.admin.deleteUser(acc.userId);
  if (error) throw error;
}

/** 画面の中を調べる(ブラウザの中で動く) */
function inspect() {
  const vw = window.innerWidth;
  const out = { overflow: [], clipped: [], ellipsis: [], overlap: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  const label = (el) => {
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
    return `<${el.tagName.toLowerCase()}> ${t.slice(0, 40)}`;
  };
  const inHScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const inFixed = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) if (/(fixed|sticky)/.test(getComputedStyle(p).position)) return true;
    return false;
  };
  const sc = document.scrollingElement;
  if (sc.scrollWidth > vw + 1) out.overflow.push(`ページ全体が横にスクロールする(${sc.scrollWidth}px / 画面${vw}px)`);
  const main = document.querySelector("main");
  if (main && main.scrollWidth > main.clientWidth + 1) out.overflow.push(`main が横にスクロールする(${main.scrollWidth}px / ${main.clientWidth}px)`);
  const all = [...document.body.querySelectorAll("*")].filter((el) => !el.closest("[aria-hidden=true]") && !["SCRIPT", "STYLE", "svg", "path"].includes(el.tagName));
  // 画面の外にはみ出した要素(完全に画面の外にあるもの=閉じたメニュー等と、横スクロールの枠の中は除く。いちばん外側だけ)
  const sticking = all.filter((el) => {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.left >= vw) return false;
    return (r.right > vw + 1 || r.left < -1) && !inHScroll(el);
  });
  for (const el of sticking) if (!sticking.includes(el.parentElement)) {
    const r = el.getBoundingClientRect();
    out.overflow.push(`画面の外にはみ出し: ${label(el)}(左${Math.round(r.left)}〜右${Math.round(r.right)}px)`);
    el.setAttribute("data-qa-issue", "1");
  }
  // 文字の切れ
  for (const el of all) {
    if (!visible(el)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const s = getComputedStyle(el);
    const hidesX = /(hidden|clip)/.test(s.overflowX);
    const hidesY = /(hidden|clip)/.test(s.overflowY) && s.webkitLineClamp === "none";
    if (hidesX && el.scrollWidth > el.clientWidth + 1) {
      if (s.textOverflow === "ellipsis") out.ellipsis.push(label(el));
      else { out.clipped.push(`横に切れている: ${label(el)}`); el.setAttribute("data-qa-issue", "1"); }
    } else if (hidesY && el.scrollHeight > el.clientHeight + 2) {
      out.clipped.push(`縦に切れている: ${label(el)}`);
      el.setAttribute("data-qa-issue", "1");
    }
  }
  // 重なり(文字を持つ末端の要素・ボタン・リンク・入力欄どうし)。次は除く(実際には見えていない・重なって見えないため):
  //  上に固定された部分、閉じた折りたたみ(details)の中身、スクロールする枠や隠す枠で見えていない部分。
  //  文中のリンク等は行ごとの四角(getClientRects)で比べる(折り返した文の全体の四角は重なって見えるため)。
  const clipBox = (el) => {
    let box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const r = p.getBoundingClientRect();
        box = { left: Math.max(box.left, r.left), top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom) };
      }
    }
    return box;
  };
  const visibleRects = (el) => {
    const box = clipBox(el);
    return [...el.getClientRects()]
      .map((r) => ({ left: Math.max(r.left, box.left), top: Math.max(r.top, box.top), right: Math.min(r.right, box.right), bottom: Math.min(r.bottom, box.bottom) }))
      .filter((r) => r.right - r.left > 2 && r.bottom - r.top > 2);
  };
  const leaves = all.filter((el) => {
    if (!visible(el) || inFixed(el)) return false;
    const closed = el.closest("details:not([open])");
    if (closed && !el.closest("summary")) return false;
    if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "IMG"].includes(el.tagName)) return true;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    return hasText && ![...el.children].some((c) => ["BUTTON", "A", "INPUT", "SELECT"].includes(c.tagName));
  });
  const rectsOf = leaves.map(visibleRects);
  for (let i = 0; i < leaves.length && out.overlap.length < 10; i++) {
    for (let j = i + 1; j < leaves.length && out.overlap.length < 10; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const hit = rectsOf[i].some((ra) => rectsOf[j].some((rb) => {
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w <= 2 || h <= 2) return false;
        const small = Math.min((ra.right - ra.left) * (ra.bottom - ra.top), (rb.right - rb.left) * (rb.bottom - rb.top));
        return (w * h) / small >= 0.25;
      }));
      if (!hit) continue;
      out.overlap.push(`${label(a)} と ${label(b)}`);
      a.setAttribute("data-qa-issue", "1");
    }
  }
  return out;
}

const results = [];
const links = new Map(); // URL → 見つけた画面
const record = (r) => {
  results.push(r);
  const n = r.overflow.length + r.clipped.length + r.overlap.length + r.errors.length;
  console.log(`${n ? "★" : "  "} [${r.account} ${r.width}px] ${r.path}${n ? ` 問題${n}件` : ""}${r.ellipsis.length ? ` 省略表示${r.ellipsis.length}件` : ""}`);
};

async function checkPage(page, account, width, url, path) {
  const errors = [];
  const onConsole = (m) => m.type() === "error" && errors.push(`コンソール: ${m.text().slice(0, 150)}`);
  const onPageError = (e) => errors.push(`ページのエラー: ${e.message.slice(0, 150)}`);
  const onResponse = (res) => {
    const u = new URL(res.url());
    if (res.status() >= 400 && (u.origin === new URL(APP).origin || u.origin === new URL(LP).origin)) errors.push(`応答${res.status()}: ${u.pathname}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(500);
    const finalPath = new URL(page.url()).pathname;
    const found = await page.evaluate(inspect);
    for (const href of await page.$$eval("a[href]", (as) => as.map((a) => a.href))) {
      if (!links.has(href)) links.set(href, `${account} ${path}`);
    }
    const r = { account, width, path, finalPath, ...found, errors };
    if (found.overflow.length + found.clipped.length + found.overlap.length) {
      await page.evaluate(() => {
        const el = document.querySelector("[data-qa-issue]");
        if (el) { el.scrollIntoView({ block: "center" }); el.style.outline = "3px solid #e11d48"; }
      });
      const file = `${account}_${width}_${path.replace(/[^a-z0-9]+/gi, "_") || "top"}.png`;
      await page.screenshot({ path: join(OUT, "shots", file) });
      r.shot = `shots/${file}`;
    }
    record(r);
  } catch (e) {
    record({ account, width, path, overflow: [], clipped: [], ellipsis: [], overlap: [], errors: [...errors, `開けなかった: ${String(e.message).slice(0, 150)}`] });
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

async function login(context, acc) {
  const page = await context.newPage();
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.fill("input[type=email]", acc.email);
  await page.locator("input[type=password]").first().fill(acc.password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
  return page;
}

const APP_PAGES = ["/", "/menus", "/menus/new", "/ingredients", "/ingredients/scan", "/ranking", "/sales", "/fl-ratio", "/alerts", "/categories", "/import", "/settings"];
const PUBLIC_PAGES = ["/login", "/reset-password", "/terms", "/privacy", "/legal"];

const accounts = [];
let browser;
try {
  accounts.push(createAccount("long"), createAccount("empty"));
  console.log("使い捨てアカウントを2つ作成(long・empty)");
  browser = await chromium.launch({ channel: "chromium", args: ["--lang=ja"] });

  // 1. ログインしていない画面とLP
  {
    const ctx = await browser.newContext({ locale: "ja-JP" });
    const page = await ctx.newPage();
    for (const w of WIDTHS) {
      for (const p of PUBLIC_PAGES) await checkPage(page, "未ログイン", w, APP + p, p);
      await checkPage(page, "LP", w, LP + "/", "/");
    }
    // LPの中のページ内リンク(#〜)の行き先があるか
    await page.goto(LP + "/", { waitUntil: "networkidle" });
    const missing = await page.$$eval("a[href^='#']", (as) => as.map((a) => a.getAttribute("href")).filter((h) => h.length > 1 && !document.querySelector(h)));
    results.push({ account: "LP", width: 0, path: "ページ内リンク", overflow: [], clipped: [], ellipsis: [], overlap: [], errors: missing.map((h) => `行き先が無いページ内リンク: ${h}`) });
    await ctx.close();
  }

  // 2. ログイン後の全画面(長い名前の店・空の店)
  for (const acc of accounts) {
    const ctx = await browser.newContext({ locale: "ja-JP" });
    const page = await login(ctx, acc);
    const pages = [...APP_PAGES];
    if (acc.preset === "long") {
      await page.goto(`${APP}/menus`, { waitUntil: "networkidle" });
      const detail = await page.$$eval("a[href^='/menus/']", (as) => as.map((a) => a.getAttribute("href")).filter((h) => h !== "/menus/new"));
      pages.splice(3, 0, ...[...new Set(detail)].slice(0, 2)); // メニューの詳細(計算できていないものも含む)
    }
    for (const w of WIDTHS) for (const p of pages) await checkPage(page, acc.preset, w, APP + p, p.replace(/\/menus\/[0-9a-f-]{36}/, "/menus/[id]"));

    // 3. 通信が遅いとき(375px、主な画面)
    if (SLOW && acc.preset === "long") {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: 60 * 1024, uploadThroughput: 30 * 1024 });
      for (const p of ["/", "/menus", "/ranking"]) {
        const t0 = Date.now();
        await checkPage(page, "long(遅い通信)", 375, APP + p, p);
        results[results.length - 1].seconds = Math.round((Date.now() - t0) / 1000);
      }
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }

    // 4. リンク切れ(アプリとLPの中のリンクだけ。ログインした状態で1回ずつ)
    if (acc.preset === "long") {
      for (const [href, from] of links) {
        const u = new URL(href);
        if (![new URL(APP).origin, new URL(LP).origin].includes(u.origin) || u.hash) continue;
        const res = await ctx.request.get(href, { maxRedirects: 5, timeout: 60000 }).catch((e) => ({ status: () => `失敗 ${e.message.slice(0, 60)}` }));
        const st = res.status();
        if (typeof st !== "number" || st >= 400) results.push({ account: "リンク", width: 0, path: u.pathname, overflow: [], clipped: [], ellipsis: [], overlap: [], errors: [`リンク切れ(${st}): ${href}(${from} から)`] });
      }
      const external = [...links.keys()].filter((h) => ![new URL(APP).origin, new URL(LP).origin].includes(new URL(h).origin));
      results.push({ account: "外部リンク(確認はしていない)", width: 0, path: "-", overflow: [], clipped: [], ellipsis: [], overlap: [], errors: [], external: [...new Set(external)] });
    }
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  for (const acc of accounts) await deleteAccount(acc);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const left = data.users.filter((u) => accounts.some((a) => a.userId === u.id)).length;
  console.log(`後片付け: 作ったアカウント${accounts.length}件を削除、残り${left}件`);
}

// 5. まとめ
writeFileSync(join(OUT, "result.json"), JSON.stringify(results, null, 1));
const lines = ["# 表示崩れの確認の結果", "", `対象: ${APP} / ${LP} 幅: ${WIDTHS.join("・")}px 実行: ${stamp}`, ""];
const bad = results.filter((r) => r.overflow.length + r.clipped.length + r.overlap.length + r.errors.length);
lines.push(`問題のあった画面: ${bad.length}件 / 調べた画面: ${results.filter((r) => r.width).length}件`, "");
for (const r of bad) {
  lines.push(`## ${r.account} ${r.width ? r.width + "px " : ""}${r.path}${r.shot ? `(画像: ${r.shot})` : ""}`);
  for (const x of [...r.overflow, ...r.clipped, ...r.overlap.map((o) => "重なり: " + o), ...r.errors]) lines.push(`- ${x}`);
  lines.push("");
}
const ell = results.filter((r) => r.ellipsis.length);
if (ell.length) {
  lines.push("## 参考: 「…」で省略して表示している箇所(意図した省略かを目で確かめる)");
  for (const r of ell) lines.push(`- ${r.account} ${r.width}px ${r.path}: ${[...new Set(r.ellipsis)].slice(0, 5).join(" / ")}`);
  lines.push("");
}
const slow = results.filter((r) => r.seconds != null);
if (slow.length) {
  lines.push("## 通信が遅いとき(375px)");
  for (const r of slow) lines.push(`- ${r.path}: ${r.seconds}秒で表示${r.errors.length ? "(エラーあり)" : ""}`);
}
writeFileSync(join(OUT, "report.md"), lines.join("\n") + "\n");
console.log(`結果: ${join(OUT, "report.md")}`);
