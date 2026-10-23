// PR動画用の、デモの納品書の画像を作る(2026-10-23)。
//   node scripts/demo/make_pr_invoice.mjs <出力先のpng>
// 宛先・取引先は架空の名前(「定食処 こはる亭」「こもれび青果株式会社」。2026-10-23に国税庁法人番号公表サイトで
// 同じ名前の法人がないことを確認済み)。住所・電話番号は載せない。「見本」の透かしを入れる。
// 品目は、デモのデータ(presets.mjs の teishoku)に登録済みの食材と同じ名前・同じ単位にする
// (新しい食材として読み取られて「未計算」のメニューが出たり、単位の注意が出たりしないようにするため)。
import sharp from "sharp";

const out = process.argv[2];
if (!out) throw new Error("出力先のpngを指定してください");

const rows = [
  ["キャベツ", 10, "個", 180],
  ["玉ねぎ", 20, "個", 55],
  ["ピーマン", 30, "個", 45],
  ["にんじん", 15, "本", 65],
  ["きゅうり", 20, "本", 65],
];
const yen = (n) => n.toLocaleString("ja-JP");
const subtotal = rows.reduce((s, [, q, , p]) => s + q * p, 0);
const tax = Math.floor(subtotal * 0.08);

const rowSvg = rows
  .map(([name, q, unit, price], i) => {
    const y = 365 + i * 50;
    return `
  <text x="80" y="${y}" font-size="22" fill="#111">${name}</text>
  <text x="430" y="${y}" font-size="22" fill="#111">${q} ${unit}</text>
  <text x="560" y="${y}" font-size="22" fill="#111">${yen(price)}円</text>
  <text x="700" y="${y}" font-size="22" fill="#111">${yen(q * price)}円</text>`;
  })
  .join("");
const endY = 365 + rows.length * 50 - 20;

const svg = `
<svg width="900" height="800" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
  <rect width="900" height="800" fill="#ffffff"/>
  <text x="450" y="90" font-size="40" text-anchor="middle" fill="#111">納 品 書</text>
  <text x="60" y="160" font-size="24" fill="#222">定食処 こはる亭 御中</text>
  <text x="60" y="198" font-size="19" fill="#333">納品日: 2026年10月20日</text>
  <text x="840" y="160" font-size="22" text-anchor="end" fill="#222">こもれび青果株式会社</text>

  <line x1="60" y1="260" x2="840" y2="260" stroke="#999" stroke-width="2"/>
  <text x="80" y="300" font-size="20" fill="#000" font-weight="bold">品目</text>
  <text x="430" y="300" font-size="20" fill="#000" font-weight="bold">数量</text>
  <text x="560" y="300" font-size="20" fill="#000" font-weight="bold">単価</text>
  <text x="700" y="300" font-size="20" fill="#000" font-weight="bold">金額</text>
  <line x1="60" y1="320" x2="840" y2="320" stroke="#ccc" stroke-width="1"/>
  ${rowSvg}
  <line x1="60" y1="${endY}" x2="840" y2="${endY}" stroke="#999" stroke-width="1"/>
  <text x="560" y="${endY + 45}" font-size="20" fill="#222">小計</text>
  <text x="700" y="${endY + 45}" font-size="20" fill="#222">${yen(subtotal)}円</text>
  <text x="560" y="${endY + 85}" font-size="20" fill="#222">消費税(8%)</text>
  <text x="700" y="${endY + 85}" font-size="20" fill="#222">${yen(tax)}円</text>
  <text x="560" y="${endY + 130}" font-size="24" fill="#000" font-weight="bold">合計</text>
  <text x="700" y="${endY + 130}" font-size="24" fill="#000" font-weight="bold">${yen(subtotal + tax)}円</text>

  <!-- 「見本」の透かし(品目の文字を読みにくくしないよう、薄くする) -->
  <text x="450" y="620" font-size="230" text-anchor="middle" fill="#d32f2f" fill-opacity="0.13"
        transform="rotate(-24 450 620)" font-weight="bold">見本</text>
  <rect x="690" y="20" width="170" height="64" rx="8" fill="none" stroke="#d32f2f" stroke-width="3" stroke-opacity="0.8"/>
  <text x="775" y="66" font-size="36" text-anchor="middle" fill="#d32f2f" fill-opacity="0.85" font-weight="bold">見 本</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log("作成:", out, `(小計 ${yen(subtotal)}円・合計 ${yen(subtotal + tax)}円)`);
