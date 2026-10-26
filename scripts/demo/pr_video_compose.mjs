// PR動画の組み立て(字幕・注記・締めのカードを画像で作り、ffmpegで重ねる)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const [dir, ffmpeg] = process.argv.slice(2);
const OV = `${dir}/overlay`;
mkdirSync(OV, { recursive: true });
const FPS = 30;

// ── 1. 場面ごとの長さを、絵コンテの秒数に合わせる(止めているコマの長さだけを伸び縮みさせる) ──
const target = { 1: 3, 2: 7, 3: 6, 4: 7, 5: 7, 6: 6 };
const m = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
for (const s of Object.keys(target)) {
  const fr = m.filter((x) => x.scene == s);
  const moving = fr.filter((x) => x.dur < 0.5).reduce((a, x) => a + x.dur, 0);
  const holds = fr.filter((x) => x.dur >= 0.5);
  const k = (target[s] - moving) / holds.reduce((a, x) => a + x.dur, 0);
  for (const h of holds) h.dur = Math.round(h.dur * k * FPS) / FPS;
  const diff = target[s] - fr.reduce((a, x) => a + x.dur, 0); // 丸めの差は最後のコマで吸収
  holds[holds.length - 1].dur = Math.round((holds[holds.length - 1].dur + diff) * FPS) / FPS;
}
// 字幕を切り替える時刻(場面2: 「読み取り中」の後、場面4: 表を横にスクロールし始める時)
let t = 0;
const switchAt = {};
const holdCount = {};
for (const x of m) {
  if (x.dur >= 0.5) {
    holdCount[x.scene] = (holdCount[x.scene] ?? 0) + 1;
    if (x.scene === 2 && holdCount[2] === 3) switchAt[2] = t + x.dur;
    if (x.scene === 4 && holdCount[4] === 1) switchAt[4] = t + x.dur;
  }
  t += x.dur;
}

// ── 2. 字幕・注記・締めのカードの画像(1080×1920、透明) ──
const DEMO = "※画面は架空の店舗のデモデータです<br>(2026年10月時点の市場価格)";
const SOURCE = "出典: 農林水産省「青果物卸売市場調査(旬別結果)」「畜産物卸売価格の推移」<br>をもとに当サービスが加工・試算した参考値。<br>国(農林水産省)が内容を保証するものではありません。";
const css = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&display=block');
*{margin:0;padding:0;box-sizing:border-box} html,body{width:1080px;height:1920px;background:transparent;font-family:'Noto Sans JP',sans-serif}
.cap{position:absolute;top:300px;left:80px;width:840px;max-height:320px;display:flex;align-items:center;justify-content:center}
.cap div{background:rgba(15,29,51,.88);color:#fff;font-weight:900;font-size:58px;line-height:1.4;text-align:center;padding:30px 40px;border-radius:22px;letter-spacing:.02em;white-space:nowrap}
.notes{position:absolute;bottom:${1920 - 1240}px;left:60px;width:860px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.notes p{background:rgba(255,255,255,.9);color:#1f2937;font-weight:500;font-size:29px;line-height:1.45;padding:9px 16px;border-radius:10px}
.notes p.src{font-size:23px;color:#4b5563}
.dim{position:absolute;inset:0;background:rgba(15,29,51,.62)}
`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
const cap = (text) => `<div class="cap"><div>${text.replace(/\n/g, "<br>")}</div></div>`;
const notes = (...ps) => `<div class="notes">${ps.map((x) => (x.startsWith("出典") ? `<p class="src">${x}</p>` : `<p>${x}</p>`)).join("")}</div>`;
const logo = `<div style="display:flex;align-items:center;gap:22px;justify-content:center">
  <div style="width:96px;height:96px;border-radius:20px;background:#fff;display:flex;align-items:center;justify-content:center">
  <svg width="58" height="58" viewBox="0 0 16 16" fill="none"><path d="M3 11.5L7 5l3 4 2-2.5 3 5" stroke="#1e3a5f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <span style="color:#fff;font-weight:900;font-size:76px;letter-spacing:.02em">原価レンズ</span></div>`;
const tagline = `<div style="position:absolute;top:470px;left:80px;width:920px;text-align:center;color:#fff;font-weight:900;font-size:74px;line-height:1.45">知らないうちに<br>減っている利益に、<br>気づける。</div>`;
const endBg = `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#0f1d33 0%,#1e3a5f 100%)"></div>`;
const brand = `<div style="position:absolute;top:880px;left:80px;width:920px;display:flex;flex-direction:column;align-items:center;gap:40px">
  ${logo}
  <span style="background:#fbbf24;color:#0f1d33;font-weight:900;font-size:50px;padding:14px 40px;border-radius:999px">無料モニター募集中</span>
  <span style="color:#fff;font-weight:700;font-size:62px;letter-spacing:.03em">genka-lens.com</span></div>`;

const overlays = [
  // [ファイル名, 中身, 開始, 終了]
  ["s1", `<div class="dim"></div>${cap("原価計算、面倒で\n後回しになっていませんか?")}`, 0, 3],
  // 注記は場面ごとに1枚にまとめて、下から積み上げる(重ならないように。デモの表示はいちばん下)
  ["n1", notes(DEMO), 0, 3],
  ["s2a", cap("納品書を撮るだけで"), 3, switchAt[2]],
  ["s2b", cap("仕入れ値を\n読み取って更新"), switchAt[2], 10],
  ["n2", notes("AIの読み取り結果は、確認してから保存します", "※読み取りの待ち時間は短縮しています", DEMO), 3, 10],
  ["s3", cap("メニューの原価率も、\n自動で計算し直し"), 10, 16],
  ["n3", notes(DEMO), 10, 16],
  ["s4a", cap("値上げを考えたい\nメニューと"), 16, switchAt[4]],
  ["s4b", cap("目安の金額が分かる"), switchAt[4], 23],
  ["n4", notes("※価格はお店のご判断で決めてください", DEMO), 16, 23],
  ["s5", cap("人件費・家賃も含めた、\nお店全体の数字が見える"), 23, 30],
  ["n5", notes("人件費・家賃・ロスは、月ごとに入力した金額で計算します", DEMO), 23, 30],
  ["s6", cap("野菜・肉の\n市場の値上がりも、\n自動でお知らせ"), 30, 36],
  ["n6", notes("※市場の値動きが仕入れ値にそのまま反映された場合の試算", SOURCE, DEMO), 30, 36],
];
const cards = [
  ["endA", `${endBg}${tagline}`],
  ["endB", `${endBg}${tagline}${brand}`],
];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
for (const [name, body] of [...overlays.map((o) => [o[0], o[1]]), ...cards]) {
  await p.setContent(page(body), { waitUntil: "load", timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OV}/${name}.png`, omitBackground: !name.startsWith("end") });
}
await b.close();

// ── 3. 下地の動画(画面のコマ+締めのカード)。場面1〜6は36秒、締めは9秒(4秒+5秒) ──
const list = [];
for (const x of m) list.push(`file 'frames/${x.file}'`, `duration ${x.dur.toFixed(5)}`);
copyFileSync(`${OV}/endA.png`, `${dir}/frames/endA.png`);
copyFileSync(`${OV}/endB.png`, `${dir}/frames/endB.png`);
list.push("file 'frames/endA.png'", "duration 4", "file 'frames/endB.png'", "duration 5", "file 'frames/endB.png'");
writeFileSync(`${dir}/concat.txt`, list.join("\n"));
const run = (args) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: dir, stdio: "inherit" });
run(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-t", "45", "base.mp4"]);

// ── 4. 字幕・注記を重ねる(0.25秒で浮き出る) ──
const inputs = ["-i", "base.mp4"];
const fl = [];
let last = "[0:v]";
overlays.forEach(([name, , s, e], i) => {
  inputs.push("-loop", "1", "-t", "45", "-i", `overlay/${name}.png`);
  const fadeIn = s > 0 ? `,fade=t=in:st=${s.toFixed(3)}:d=0.25:alpha=1` : "";
  fl.push(`[${i + 1}:v]format=rgba${fadeIn}[o${i}]`);
  fl.push(`${last}[o${i}]overlay=0:0:enable='between(t,${s.toFixed(3)},${(e - 0.001).toFixed(3)})'[v${i}]`);
  last = `[v${i}]`;
});

run([...inputs, "-filter_complex", fl.join(";"), "-map", last, "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", "45", "pr-video.mp4"]);
// 字幕なしの素材も残す
copyFileSync(`${dir}/base.mp4`, `${dir}/pr-video_no-captions.mp4`);

// ── 5. 字幕ファイル(SRT) ──
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const srt = [
  [0, 3, "原価計算、面倒で\n後回しになっていませんか?"],
  [3, switchAt[2], "納品書を撮るだけで"],
  [switchAt[2], 10, "仕入れ値を\n読み取って更新"],
  [10, 16, "メニューの原価率も、\n自動で計算し直し"],
  [16, switchAt[4], "値上げを考えたい\nメニューと"],
  [switchAt[4], 23, "目安の金額が分かる"],
  [23, 30, "人件費・家賃も含めた、\nお店全体の数字が見える"],
  [30, 36, "野菜・肉の\n市場の値上がりも、\n自動でお知らせ"],
  [36, 45, "知らないうちに減っている利益に、気づける。\n原価レンズ / 無料モニター募集中 / genka-lens.com"],
].map(([s, e, x], i) => `${i + 1}\n${ts(s)} --> ${ts(e)}\n${x}\n`).join("\n");
writeFileSync(`${dir}/pr-video.srt`, srt);
console.log("切り替え時刻: 場面2", switchAt[2].toFixed(2), "秒 / 場面4", switchAt[4].toFixed(2), "秒");
