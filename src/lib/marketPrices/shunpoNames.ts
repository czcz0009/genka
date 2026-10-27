/**
 * 旬報の表示名(2026-10-27)。農林水産省の統計の品目名を、店主になじみのある呼び方に直して表示する
 * (下書きの本文と画像の両方。選び方.txt には統計の名前も残す)。出典の範囲(加工して作成)は変わらない。
 * 最初は、10月上旬・10月中旬の下書きに出た野菜から。新しい品目が出たら、ここに足す(テストは shunpoNames.test.ts)。
 */
export const DISPLAY_NAMES: Record<string, string> = {
  セルリー: "セロリ",
  ちんげんさい: "チンゲン菜",
  こまつな: "小松菜",
  みずな: "水菜",
  はくさい: "白菜",
  ほうれんそう: "ほうれん草",
  しゅんぎく: "春菊",
  さやいんげん: "いんげん",
  スイートコーン: "とうもろこし",
  さやえんどう: "絹さや",
};

export function displayName(officialName: string): string {
  return DISPLAY_NAMES[officialName] ?? officialName;
}
