"use client";

/**
 * 「店舗情報の取得に失敗しました」だけで終わっていた各画面共通のエラー表示。
 * 原因(多くは一時的なネットワーク不調)と、次に何をすればいいか(再読み込み)を
 * 添えるようにした共通コンポーネント。
 */
export function StoreLoadError() {
  return (
    <div className="text-sm text-red-600 dark:text-red-400">
      <p>店舗情報の取得に失敗しました。ネットワークが不安定になっている可能性があります。</p>
      <button
        onClick={() => location.reload()}
        className="mt-3 rounded-lg border border-red-300 px-4 py-2.5 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
      >
        再読み込みする
      </button>
    </div>
  );
}
