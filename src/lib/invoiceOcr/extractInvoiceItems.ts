import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import heicDecode from "heic-decode";
import { parseExtractionResponse } from "./parseExtractionResponse.ts";
import type { InvoiceImageType } from "./imageType.ts";
import { classifyAiError } from "./serviceError.ts";
import { ocrGateMessage } from "./usageLimit.ts";
import { OCR_MAX_TOKENS, OCR_MODEL, OCR_TEMPERATURE } from "./extractionSettings.ts";
import type { ExtractedInvoiceItem, InvoiceMeta } from "./types.ts";

/**
 * 納品書・請求書の写真から、食材名・数量・単価をClaude(Vision)で読み取る。
 *
 * この機能は他の取り込み機能(CSV取り込み・市場価格アラート)と違い、
 * 呼び出すたびに実費(AI API利用料)が発生する。将来的に有料プランの
 * 機能として切り出せるよう、この処理は他の無料機能から独立した
 * このファイル・専用のサーバーアクション(scan/actions.ts)にまとめている。
 *
 * コスト管理のため、送信前に長辺1568px程度までリサイズする(Claudeの
 * 標準解像度tierの上限と合わせることで、画像1枚あたりのトークン数を
 * 予測しやすくする。詳細はCLAUDE公式ドキュメントのVisionページ参照)。
 */

const MAX_LONG_EDGE = 1568;

// 読み取り精度とコストのバランスを見てHaiku 4.5を既定にしている
// (構造化されたJSON抽出という定型タスクのため、上位モデルほどの推論力は
// 必須ではない想定。精度に問題が出た場合はSonnet系への切り替えを検討する)。
const MODEL = OCR_MODEL;

const EXTRACTION_PROMPT = `あなたは飲食店向け原価計算ツールの一部として、納品書・請求書の写真から仕入れ品目を読み取るアシスタントです。

この画像(印刷された納品書または請求書)を読み取り、次の形のJSONを出力してください。

{"invoice": {...納品書全体の情報...}, "items": [{...品目1...}, {...品目2...}]}

invoice(納品書全体の情報):
- date: 納品日(または伝票の日付)。"YYYY-MM-DD" の形(例: "2026-10-20")。和暦は西暦に直す。読み取れなければnull
- supplier: 仕入れ先(納品書を出した会社・お店)の名前。印字されている表記のまま。読み取れなければnull
- totalAmount: 納品書の合計金額(数値。消費税を含む最終的な請求額)。読み取れなければnull
- taxBasis: 品目の単価・金額が税込なら "inclusive"、税抜なら "exclusive"。「税抜」「外税」「消費税 別」「小計の下に消費税が別に足されている」などは "exclusive"、「税込」「内税」などは "inclusive"。判断できなければnull

items(品目ごと):
- name: 品目名(食材名)。印字されている表記のまま
- quantity: 数量(数値。読み取れなければnull)
- unit: 単位(例: "kg", "g", "本", "個"。読み取れなければnull)
- unitPrice: 単価(1単位あたりの金額。数値。記載が無ければnull)
- totalAmount: その行の金額(数値。記載が無ければnull)
- taxRate: その行の消費税率。8 または 10。「※」「軽」などの軽減税率の印があれば8、10%の印(酒類・資材など)があれば10。印が無く判断できなければnull
- lowConfidence: 手ブレ・かすれ・判読困難などで読み取りに自信が持てない場合はtrue、そうでなければfalse
- note: lowConfidenceがtrueの場合、その理由を一言(日本語)。自信があればnull

守ってほしいこと:
- 手書きの文字は今回のスコープ外です。印刷された文字を中心に読み取ってください
- 読み取れない・自信が持てない値は無理に推測せず、null にしたうえでlowConfidenceをtrueにしてください
- 単価が書かれていない場合、unitPrice は null のままにしてください(金額と数量から計算しないでください。計算はアプリが行います)
- 出力は上記のJSONのみとし、説明文やMarkdownのコードフェンスは付けないでください
- 品目が1つも読み取れない場合は items を空配列 [] にしてください`;

export interface ExtractInvoiceItemsResult {
  items: ExtractedInvoiceItem[];
  /** 納品書全体の情報(2026-10-28)。読めなかったときは無し */
  invoice?: InvoiceMeta;
  error: string | null;
  /**
   * AI側の都合(残高不足・鍵・混雑・障害・通信)で読めなかったときの記録の種類。このときは店主の回数を減らさない
   * (呼び出し側で試行を取り消す)。写真の側の問題のときは null。2026-10-27
   */
  unavailable?: "credit" | "auth" | "busy" | null;
}

/**
 * アップロードされた画像(JPEG・PNG・WebP・HEIC。種類は imageType.ts で中身から判定済み)を、送信用に
 * リサイズ・JPEG圧縮する。
 * HEIC(iPhoneの写真の形式)は、sharpの同梱版では読めないため、heic-decode(HEIFの標準の部品 libheif の
 * WebAssembly版。サーバーの中だけで使う)で画素に戻してから、sharpに渡す(2026-10-26)。
 * HEICの回転の情報は heic-decode が画素に反映済み。
 */
export async function prepareImage(buffer: Buffer, type: InvoiceImageType): Promise<Buffer> {
  if (type === "heic") {
    const { width, height, data } = await heicDecode({ buffer });
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } })
      .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  return sharp(buffer)
    .rotate() // Exifの回転情報を反映してから処理する(スマホ写真の横向き問題対策)
    .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function extractInvoiceItems(imageBuffer: Buffer, type: InvoiceImageType): Promise<ExtractInvoiceItemsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { items: [], error: ocrGateMessage("unavailable"), unavailable: "auth" };
  }

  let prepared: Buffer;
  try {
    prepared = await prepareImage(imageBuffer, type);
  } catch {
    return { items: [], error: "画像を処理できませんでした。別の写真でお試しください。" };
  }

  const client = new Anthropic({ apiKey });

  let responseText: string;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: OCR_MAX_TOKENS,
      temperature: OCR_TEMPERATURE, // ばらつきを小さくする(extractionSettings.ts)
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: prepared.toString("base64") } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    responseText = textBlock && "text" in textBlock ? textBlock.text : "";
  } catch (e) {
    const c = classifyAiError(e);
    if (c.kind === "unavailable") return { items: [], error: ocrGateMessage("unavailable"), unavailable: c.incident };
    return { items: [], error: "写真を読み取れませんでした。別の写真でお試しください。" };
  }

  return parseExtractionResponse(responseText);
}
