// PR動画のコマ撮り(本番・PR用デモアカウント)。ログイン情報はファイルから読み、表示しない
// 出力: <out>/frames/*.png と <out>/manifest.json([{file, dur, scene}])、<out>/numbers.json(画面に出た数字)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
const txt = readFileSync(process.env.PR_LOGIN_FILE ?? "C:/Users/tarutani.mahiro/genka-demo/pr-demo-login.txt", "utf8");
const email = txt.match(/メールアドレス: (\S+)/)[1], pw = txt.match(/パスワード: (\S+)/)[1];
const [out, invoice, mode = "all"] = process.argv.slice(2);
const FR = `${out}/frames`;
const BASE = "https://app.genka-lens.com";
const FPS = 30;
let manifest = [];
let numbers = {};
let n = 0;
if (mode === "from3") {
  // 場面1・2(読み取りと保存)は撮り直さない(読み取りの回数を使うため)。それまでのコマを残して3から撮る
  manifest = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8")).filter((m) => m.scene <= 2);
  numbers = JSON.parse(readFileSync(`${out}/numbers.json`, "utf8"));
  n = Math.max(...manifest.map((m) => +m.file.slice(1, 5))) + 1;
} else {
  rmSync(FR, { recursive: true, force: true });
  mkdirSync(FR, { recursive: true });
}
const save = () => {
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
  writeFileSync(`${out}/numbers.json`, JSON.stringify(numbers, null, 1));
};

const b = await chromium.launch({ channel: "chromium", args: ["--lang=ja"] });
const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const p = await ctx.newPage();
p.setDefaultTimeout(90000);

async function snap(scene, dur) {
  const file = `f${String(n++).padStart(4, "0")}.png`;
  await p.screenshot({ path: `${FR}/${file}` });
  manifest.push({ file, dur, scene });
}
/** 文字を含む要素のうち、いちばん小さいもの */
async function mark(sel, texts, name) {
  const ok = await p.evaluate(([sel, texts, name]) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => {
      const t = (e.innerText || "") + " " + [...e.querySelectorAll("input")].map((i) => i.value).join(" ");
      return texts.every((x) => t.includes(x)) && e.getBoundingClientRect().width > 0;
    });
    all.sort((a, c) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - c.getBoundingClientRect().width * c.getBoundingClientRect().height);
    if (!all[0]) return false;
    document.querySelectorAll(`[data-pr="${name}"]`).forEach((e) => e.removeAttribute("data-pr"));
    all[0].setAttribute("data-pr", name);
    return true;
  }, [sel, texts, name]);
  if (!ok) throw new Error(`見つからない: ${sel} ${texts.join("/")}`);
}
/** 印を付けた要素を、上から y(CSS px)の位置に来るようにスクロール(frames>0ならなめらかに) */
async function scrollTo(name, y, scene, frames = 0, hl = null) {
  const target = await p.evaluate(([name, y]) => {
    const m = document.querySelector("main"), e = document.querySelector(`[data-pr="${name}"]`);
    return Math.max(0, Math.min(m.scrollHeight - m.clientHeight, m.scrollTop + e.getBoundingClientRect().top - y));
  }, [name, y]);
  const start = await p.evaluate(() => document.querySelector("main").scrollTop);
  for (let i = 1; i <= frames; i++) {
    const t = i / frames, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await p.evaluate((v) => (document.querySelector("main").scrollTop = v), start + (target - start) * e);
    if (hl) await spot(hl);
    await snap(scene, 1 / FPS);
  }
  await p.evaluate((v) => (document.querySelector("main").scrollTop = v), target);
}
/** 印を付けた要素を赤い枠で囲み、ほかを少し暗くする(nullで消す) */
async function spot(name) {
  await p.evaluate((name) => {
    let d = document.getElementById("__pr_spot");
    if (!name) { d?.remove(); return; }
    const r = document.querySelector(`[data-pr="${name}"]`).getBoundingClientRect();
    if (!d) { d = document.createElement("div"); d.id = "__pr_spot"; document.body.appendChild(d); }
    Object.assign(d.style, { position: "fixed", zIndex: 99999, pointerEvents: "none", left: r.left - 5 + "px", top: r.top - 5 + "px", width: r.width + 10 + "px", height: r.height + 10 + "px", border: "3px solid #e11d48", borderRadius: "10px", boxShadow: "0 0 0 9999px rgba(15,23,42,0.38)" });
  }, name);
}
async function go(path) {
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelector("main").scrollTop = 0);
  await p.waitForTimeout(400);
}

// ログイン
await p.goto(BASE + "/login", { waitUntil: "networkidle" });
await p.fill("input[type=email]", email);
await p.locator("input[type=password]").first().fill(pw);
await p.locator("button[type=submit]").click();
await p.waitForURL((u) => !u.pathname.startsWith("/login"));

if (mode !== "from3") {
// 場面1(0〜3秒): ダッシュボードを暗くして文字のカード(暗くするのは組み立てのときに行う)
await go("/");
await snap(1, 3.0);

// 場面2(3〜10秒): 納品書を読み取って保存
await go("/ingredients/scan");
await p.setInputFiles("input[type=file]", invoice);
await p.waitForSelector('img[alt="選択した納品書のプレビュー"]');
await p.waitForTimeout(600);
await p.evaluate(() => document.querySelector('img[alt="選択した納品書のプレビュー"]').setAttribute("data-pr", "preview"));
await scrollTo("preview", 222, 2, 12);
await spot("preview");
await snap(2, 1.3);
await mark("button", ["この写真を読み取る"], "scanbtn");
await scrollTo("scanbtn", 360, 2, 8, null);
await spot("scanbtn");
await snap(2, 0.6);
await spot(null);
await p.locator("button", { hasText: "この写真を読み取る" }).click();
await p.waitForTimeout(300);
await mark("button", ["読み取り中"], "scanbtn");
await spot("scanbtn");
await snap(2, 0.8);
await spot(null);
await p.waitForSelector("text=読み取り結果(", { timeout: 120000 });
await p.waitForTimeout(800);
await mark("li", ["キャベツ"], "cabbage");
numbers.scanRows = await p.evaluate(() => [...document.querySelectorAll("li")].filter((l) => l.querySelector("input[type=checkbox]")).map((l) => [...l.querySelectorAll("input,select")].map((i) => i.value).filter(Boolean).join(" | ")));
await scrollTo("cabbage", 222, 2, 14, null);
await spot("cabbage");
await snap(2, 2.0);
await mark("button", ["選択した品目をまとめて保存"], "savebtn");
await scrollTo("savebtn", 300, 2, 10, null);
await spot("savebtn");
await snap(2, 0.7);
await spot(null);
await p.locator("button", { hasText: "選択した品目をまとめて保存" }).click();
await p.waitForFunction(() => ![...document.querySelectorAll("button")].some((x) => x.innerText.includes("保存中")), null, { timeout: 60000 });
await p.waitForTimeout(800);
await mark("li", ["キャベツ"], "cabbage");
await scrollTo("cabbage", 222, 2, 0);
await snap(2, 1.0);
numbers.afterSaveCabbageRow = await p.evaluate(() => document.querySelector('[data-pr="cabbage"]').innerText.replace(/\s+/g, " "));
save();
console.log("場面1・2を撮影済み(読み取り・保存まで)");
}

// 場面3(10〜16秒): メニュー一覧の原価率
await go("/menus");
await snap(3, 0.8);
await mark("main div, main li", ["野菜炒め定食", "%", "削除する"], "yasai");
await scrollTo("yasai", 250, 3, 30, null);
await spot("yasai");
await snap(3, 4.2);
numbers.menuYasai = await p.evaluate(() => document.querySelector('[data-pr="yasai"]').innerText.replace(/\s+/g, " "));

// 場面4(16〜23秒): 今見直すべきメニューと値上げの目安
await go("/ranking");
await mark("tr", ["生姜焼き定食"], "row1");
await scrollTo("row1", 300, 4, 18, null);
await spot("row1");
await snap(4, 2.9);
numbers.ranking = await p.evaluate(() => [...document.querySelectorAll("tr")].slice(0, 4).map((r) => r.innerText.replace(/\s+/g, " ")));
// 表を横にスクロールして「値上げ目安」の列へ
await mark("td", ["円が目安"], "meyasu");
const steps = 24;
for (let i = 1; i <= steps; i++) {
  await p.evaluate(([i, steps]) => {
    const td = document.querySelector('[data-pr="meyasu"]');
    let s = td.parentElement; while (s && !(s.scrollWidth > s.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(s).overflowX))) s = s.parentElement;
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (s) s.scrollLeft = (s.scrollWidth - s.clientWidth) * e;
  }, [i, steps]);
  await snap(4, 1 / FPS);
}
await spot("meyasu");
await snap(4, 3.3);

// 場面5(23〜30秒): FL比率と実質原価率
await go("/fl-ratio");
await p.evaluate(() => {
  const c = [...document.querySelectorAll("main div")].filter((e) => /FL比率/.test(e.innerText) && !/FLR/.test(e.innerText) && /正常|注意|危険/.test(e.innerText) && e.innerText.length < 30);
  c.sort((a, b) => a.innerText.length - b.innerText.length);
  c[c.length - 1].setAttribute("data-pr", "fl");
});
await scrollTo("fl", 300, 5, 24, null);
await spot("fl");
await snap(5, 2.7);
numbers.fl = await p.evaluate(() => document.querySelector('[data-pr="fl"]').innerText.replace(/\s+/g, " "));
await spot(null);
await mark("main div", ["実質原価率(ロス・値引き込み)", "%"], "jissitsu");
await scrollTo("jissitsu", 300, 5, 20, null);
await spot("jissitsu");
await snap(5, 2.9);
numbers.jissitsu = await p.evaluate(() => document.querySelector('[data-pr="jissitsu"]').innerText.replace(/\s+/g, " "));

// 場面6(30〜36秒): 市場の値上がりのお知らせ(試算)
await go("/alerts");
await mark("main div, main li, main section", ["キャベツ(市場「キャベツ」)が値上がり", "(試算)"], "alert");
await scrollTo("alert", 230, 6, 36, null);
await spot("alert");
await snap(6, 4.8);
numbers.alert = await p.evaluate(() => document.querySelector('[data-pr="alert"]').innerText.replace(/\s+/g, " "));
numbers.status = await p.evaluate(() => [...document.querySelectorAll("main div.rounded.border")].find((e) => e.innerText.includes("取得済み"))?.innerText.replace(/\s+/g, " "));

save();
const dur = {};
for (const m of manifest) dur[m.scene] = (dur[m.scene] ?? 0) + m.dur;
console.log("コマ数", manifest.length, "場面ごとの秒数", JSON.stringify(Object.fromEntries(Object.entries(dur).map(([k, v]) => [k, +v.toFixed(2)]))));
await b.close();
