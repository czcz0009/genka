import Link from "next/link";

/**
 * 「まだ何も登録されていない」状態で必ず表示する、次のアクションへの入り口。
 * ホーム画面のオンボーディング選択と、他の画面(ランキング等)の空の状態
 * どちらからも使う共通コンポーネント。
 */
export function StartHerePrompt({
  heading = "まだメニューが登録されていません",
  description = "CSV/Excelを取り込むか、手入力でメニューを登録して始めましょう。",
}: {
  heading?: string;
  description?: string;
}) {
  return (
    <div className="mt-8 rounded-xl border-2 border-dashed border-black/15 p-8 text-center dark:border-white/15">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">{description}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/import"
          className="rounded-lg border border-black/15 px-6 py-4 text-base font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          CSV/Excelを取り込む
        </Link>
        <Link
          href="/menus/new"
          className="rounded-lg bg-black px-6 py-4 text-base font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          手入力で始める
        </Link>
      </div>
    </div>
  );
}
