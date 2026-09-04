// pdfjs-distはworker本体の型定義を公開していない(型はメインの pdf.mjs 側にしかない)。
// src/lib/marketPrices/livestock/parseChikusanPdf.ts が静的importする際に必要。
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
