import Link from "next/link";

/**
 * 「まだ何も登録されていない」状態で必ず表示する、次のアクションへの入り口。
 * ホーム画面のオンボーディング選択と、他の画面(ランキング等)の空の状態
 * どちらからも使う共通コンポーネント。
 */
export function StartHerePrompt({
  heading = "まだメニューが登録されていません",
  description = "Excelで管理している表があれば取り込みが早いですが、なくても手入力で1分で始められます。",
}: {
  heading?: string;
  description?: string;
}) {
  return (
    <div className="mt-8 rounded border-2 border-dashed p-8 text-center" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
        {heading}
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{description}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/import"
          prefetch={false}
          className="rounded border px-6 py-4 text-base font-semibold transition-colors hover:border-[color:var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          Excelで管理してる表がある場合はこちら
        </Link>
        <Link
          href="/menus/new"
          prefetch={false}
          className="rounded px-6 py-4 text-base font-bold"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          手入力で始める
        </Link>
      </div>
    </div>
  );
}
