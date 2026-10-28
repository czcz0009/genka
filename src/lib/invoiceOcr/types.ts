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
  /** その行の消費税率(8 または 10)。読み取れなければnull(画面では8%として扱う)。2026-10-28 */
  taxRate: 8 | 10 | null;
  /** 手ブレ・かすれ等で読み取りに自信が持てない項目があるか */
  lowConfidence: boolean;
  /** lowConfidenceの理由(無ければnull)。店主への注意書きにそのまま使う。 */
  note: string | null;
}

/** 納品書全体の情報(2026-10-28)。税込・税抜の判定と、同じ納品書の二度読みに気づくために使う。読み取れなければnull */
export interface InvoiceMeta {
  /** 納品日(YYYY-MM-DD) */
  date: string | null;
  /** 仕入れ先(印字のまま) */
  supplier: string | null;
  /** 納品書の合計金額 */
  totalAmount: number | null;
  /** 金額が税込か税抜か */
  taxBasis: "inclusive" | "exclusive" | null;
}
