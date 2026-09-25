import sharp from "sharp";

const svg = `
<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="1200" fill="#ffffff"/>
  <text x="450" y="90" font-size="40" font-family="sans-serif" text-anchor="middle" fill="#111">納 品 書</text>
  <text x="60" y="160" font-size="22" font-family="sans-serif" fill="#333">お届け先: サンプル食堂 御中</text>
  <text x="60" y="195" font-size="18" font-family="sans-serif" fill="#333">納品日: 2026年9月20日</text>
  <text x="60" y="225" font-size="18" font-family="sans-serif" fill="#333">仕入先: サンプル青果卸売株式会社</text>

  <line x1="60" y1="260" x2="840" y2="260" stroke="#999" stroke-width="2"/>
  <text x="80" y="300" font-size="20" font-family="sans-serif" fill="#000" font-weight="bold">品目</text>
  <text x="420" y="300" font-size="20" font-family="sans-serif" fill="#000" font-weight="bold">数量</text>
  <text x="540" y="300" font-size="20" font-family="sans-serif" fill="#000" font-weight="bold">単価</text>
  <text x="680" y="300" font-size="20" font-family="sans-serif" fill="#000" font-weight="bold">金額</text>
  <line x1="60" y1="320" x2="840" y2="320" stroke="#ccc" stroke-width="1"/>

  <text x="80" y="365" font-size="20" font-family="sans-serif" fill="#111">豚肉(バラ)</text>
  <text x="420" y="365" font-size="20" font-family="sans-serif" fill="#111">2 kg</text>
  <text x="540" y="365" font-size="20" font-family="sans-serif" fill="#111">1,200円</text>
  <text x="680" y="365" font-size="20" font-family="sans-serif" fill="#111">2,400円</text>

  <text x="80" y="415" font-size="20" font-family="sans-serif" fill="#111">玉ねぎ</text>
  <text x="420" y="415" font-size="20" font-family="sans-serif" fill="#111">5 kg</text>
  <text x="540" y="415" font-size="20" font-family="sans-serif" fill="#111">200円</text>
  <text x="680" y="415" font-size="20" font-family="sans-serif" fill="#111">1,000円</text>

  <text x="80" y="465" font-size="20" font-family="sans-serif" fill="#111">キャベツ</text>
  <text x="420" y="465" font-size="20" font-family="sans-serif" fill="#111">3 玉</text>
  <text x="540" y="465" font-size="20" font-family="sans-serif" fill="#111">150円</text>
  <text x="680" y="465" font-size="20" font-family="sans-serif" fill="#111">450円</text>

  <text x="80" y="515" font-size="20" font-family="sans-serif" fill="#111">醤油(1.8L)</text>
  <text x="420" y="515" font-size="20" font-family="sans-serif" fill="#111">1 本</text>
  <text x="540" y="515" font-size="20" font-family="sans-serif" fill="#111">980円</text>
  <text x="680" y="515" font-size="20" font-family="sans-serif" fill="#111">980円</text>

  <line x1="60" y1="560" x2="840" y2="560" stroke="#999" stroke-width="2"/>
  <text x="620" y="610" font-size="22" font-family="sans-serif" fill="#000" font-weight="bold">合計 4,830円</text>
</svg>
`;

const outPath = process.argv[2] || "invoice_sample.png";
await sharp(Buffer.from(svg)).png().toFile(outPath);
console.log("written:", outPath);
