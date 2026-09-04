import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">原価計算・値付けツール</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          個人飲食店向けの原価計算・メニュー値付けMVP。まずはレシピ・仕入れデータの取り込みから。
        </p>
      </div>

      <Link
        href="/import"
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
      >
        CSV/Excelを取り込む
      </Link>

      <p className="text-xs text-black/40 dark:text-white/40">
        仕入れ値変動アラート・利益貢献度ランキングは次のステップで追加予定です。
      </p>
    </main>
  );
}
