import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { parseExtractionResponse } from "./parseExtractionResponse.ts";
import type { ExtractedInvoiceItem } from "./types.ts";

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
const MODEL = "claude-haiku-4-5-20251001";

const EXTRACTION_PROMPT = `あなたは飲食店向け原価計算ツールの一部として、納品書・請求書の写真から仕入れ品目を読み取るアシスタントです。

この画像(印刷された納品書または請求書)を読み取り、記載されている品目ごとに以下の情報をJSON配列として出力してください。

- name: 品目名(食材名)。印字されている表記のまま
- quantity: 数量(数値。読み取れなければnull)
- unit: 単位(例: "kg", "g", "本", "個"。読み取れなければnull)
- unitPrice: 単価(1単位あたりの金額。数値。記載が無ければnull)
- totalAmount: その行の合計金額(数値。記載が無ければnull)
- lowConfidence: 手ブレ・かすれ・判読困難などで読み取りに自信が持てない場合はtrue、そうでなければfalse
- note: lowConfidenceがtrueの場合、その理由を一言(日本語)。自信があればnull

守ってほしいこと:
- 手書きの文字は今回のスコープ外です。印刷された文字を中心に読み取ってください
- 読み取れない・自信が持てない値は無理に推測せず、null にしたうえでlowConfidenceをtrueにしてください
- 出力は上記のJSON配列のみとし、説明文やMarkdownのコードフェンスは付けないでください
- 品目が1つも読み取れない場合は空配列 [] を返してください`;

export interface ExtractInvoiceItemsResult {
  items: ExtractedInvoiceItem[];
  error: string | null;
}

/**
 * アップロードされた画像(任意のフォーマット・サイズ)を、送信用に
 * リサイズ・JPEG圧縮する。
 */
async function prepareImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // Exifの回転情報を反映してから処理する(スマホ写真の横向き問題対策)
    .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function extractInvoiceItems(imageBuffer: Buffer): Promise<ExtractInvoiceItemsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { items: [], error: "写真からの読み取り機能が設定されていません(ANTHROPIC_API_KEY未設定)。" };
  }

  let prepared: Buffer;
  try {
    prepared = await prepareImage(imageBuffer);
  } catch {
    return { items: [], error: "画像を処理できませんでした。別の写真でお試しください。" };
  }

  const client = new Anthropic({ apiKey });

  let responseText: string;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
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
  } catch {
    return { items: [], error: "読み取り処理に失敗しました。通信状況を確認して、もう一度お試しください。" };
  }

  return parseExtractionResponse(responseText);
}
