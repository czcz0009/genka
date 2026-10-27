// heic-decode(HEICの画像を画素に戻す部品)には型の定義が無いため、使う範囲だけ書く(2026-10-26)。
declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA の画素(1画素4バイト) */
    data: Uint8ClampedArray;
  }
  function decode(input: { buffer: ArrayBuffer | Uint8Array }): Promise<DecodedImage>;
  export default decode;
}
