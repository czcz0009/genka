import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument.tsx";
import { SERVICE_NAME } from "@/lib/serviceName.ts";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
};

const CONTACT_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfKevfXMlqDf8deogpss-HfgUCqTz5-fKUyNO4eUrGu7-f7Lw/viewform";

const sections: LegalSection[] = [
  {
    heading: "事業者情報",
    body: `事業者名: [要確認]
運営責任者: [要確認]
所在地: [要確認: 通常表示するか「請求があれば遅滞なく開示します」とするか。この方式の可否は専門家にご確認ください]
連絡先: [要確認: 電話番号またはメールアドレス。同上]
お問い合わせ窓口: ${CONTACT_URL}
サービス名: ${SERVICE_NAME}`,
  },
  {
    heading: "提供内容",
    body: `飲食店向け原価計算・メニュー値付け支援ツール`,
  },
  {
    heading: "販売価格",
    body: `現在は無料モニター期間として提供しており、料金はかかりません。
将来、有料プランを設ける場合は、価格・条件をあらためて本ページに掲載し、変更予定日の30日前までにお知らせします。
利用者本人の同意なく課金することはありません。`,
  },
  {
    heading: "支払方法・支払時期",
    body: `[要確認: 有料化時に定めます。現時点では発生しません]`,
  },
  {
    heading: "役務の提供時期",
    body: `登録完了後、直ちにご利用いただけます。`,
  },
  {
    heading: "返品・キャンセルについて",
    body: `本サービスはオンラインで提供する役務のため、性質上、返品にはなじみません。退会(利用停止)については、本サービスの設定画面からいつでも申請できます(申請から30日間はお申し出により取り消せます)。
[要確認: 有料プラン開始後の返金・解約に関する条件は、あらためて定めます]`,
  },
  {
    heading: "動作環境",
    body: `スマートフォン・パソコンのWebブラウザ(インターネット接続が必要です)`,
  },
  {
    heading: "施行日",
    body: `[要確認]`,
  },
];

export default function LegalPage() {
  return <LegalDocument title="特定商取引法に基づく表示" sections={sections} />;
}
