/** 納品書・請求書の写真から読み取った1行分の候補。 */
export interface ExtractedInvoiceItem {
  /** 納品書に印字されていた食材名(そのまま。表記ゆれの正規化はしない) */
  name: string;
  quantity: number | null;
  unit: string | null;
  /** 単価(1単位あたり)。読み取れなければnull */
  unitPrice: number | null;
  /** その行の合計金額。単価が無く金額だけ読み取れた場合に使う */
  totalAmount: number | null;
  /** 手ブレ・かすれ等で読み取りに自信が持てない項目があるか */
  lowConfidence: boolean;
  /** lowConfidenceの理由(無ければnull)。店主への注意書きにそのまま使う。 */
  note: string | null;
}
