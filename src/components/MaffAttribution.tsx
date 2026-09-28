/**
 * 農林水産省の統計データ(青果物卸売市場調査・畜産物卸売価格の推移)を使う画面で
 * 共通して表示する出典表記。
 *
 * 農水省の統計データは「公共データ利用規約(PDL1.0)」に基づいて二次利用でき、
 * その条件として(1)出典の明記、(2)加工した場合はその旨の明記、(3)国が内容を
 * 保証しているという誤解を招かないこと、が求められる。
 * (参照: https://www.maff.go.jp/j/tokei/qanda.html)
 *
 * LP(landing/src/App.tsx)には同じ内容をJSXとして手動で複製している
 * (別プロジェクトのため、この定数をimportできない)。文言を変える場合は
 * 両方を必ず合わせること。
 */
export function MaffAttribution({ className }: { className?: string }) {
  return (
    <p className={className}>
      出典: 農林水産省「
      <a href="https://www.maff.go.jp/j/tokei/syohi/shunbetu/" target="_blank" rel="noopener noreferrer" className="underline">
        青果物卸売市場調査(旬別結果)
      </a>
      」「
      <a href="https://www.maff.go.jp/j/chikusan/shokuniku/lin/" target="_blank" rel="noopener noreferrer" className="underline">
        畜産物卸売価格の推移
      </a>
      」。取得したデータをもとに当サービスが加工・試算した参考値であり、国(農林水産省)が内容を保証するものではありません。
    </p>
  );
}
