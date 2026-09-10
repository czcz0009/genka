"use client";

/**
 * 「店舗情報の取得に失敗しました」だけで終わっていた各画面共通のエラー表示。
 * 原因(多くは一時的なネットワーク不調)と、次に何をすればいいか(再読み込み)を
 * 添えるようにした共通コンポーネント。
 */
export function StoreLoadError() {
  return (
    <div className="text-sm" style={{ color: "var(--status-danger)" }}>
      <p>店舗情報の取得に失敗しました。ネットワークが不安定になっている可能性があります。</p>
      <button
        onClick={() => location.reload()}
        className="mt-3 rounded border px-4 py-2.5 transition-colors"
        style={{ borderColor: "var(--status-danger)", color: "var(--status-danger)" }}
      >
        再読み込みする
      </button>
    </div>
  );
}
