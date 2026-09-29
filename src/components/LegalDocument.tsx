import Link from "next/link";

/** 本文中のURLをクリックできるリンクにする(それ以外はそのままのテキスト)。 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export interface LegalSection {
  heading: string;
  body: string;
}

/**
 * 利用規約・プライバシーポリシー・特定商取引法に基づく表示、共通のページ枠。
 * ログイン不要で誰でも閲覧できる(/terms, /privacy, /legal はいずれも
 * (app)グループの外にあり、サイドバー無し・認証チェック無しの単純な
 * 静的ページ)。
 */
export function LegalDocument({
  title,
  preamble,
  sections,
  footer,
}: {
  title: string;
  /** 本文冒頭、条文の前に置く説明文(任意)。 */
  preamble?: string;
  sections: LegalSection[];
  /** 末尾(運営者情報など)。 */
  footer?: string;
}) {
  return (
    <div className="min-h-full" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-16">
        <Link href="/login" className="text-sm underline underline-offset-2" style={{ color: "var(--muted-foreground)" }}>
          ← ログイン画面に戻る
        </Link>
        <h1
          className="mt-4 text-2xl font-bold"
          style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
        >
          {title}
        </h1>
        {preamble && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            <Linkified text={preamble} />
          </p>
        )}
        <div className="mt-8 flex flex-col gap-6">
          {sections.map((s, i) => (
            <section key={i}>
              <h2
                className="text-base font-bold"
                style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
              >
                {s.heading}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                <Linkified text={s.body} />
              </p>
            </section>
          ))}
        </div>
        {footer && (
          <p
            className="mt-10 whitespace-pre-line border-t pt-6 text-sm leading-relaxed"
            style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}
          >
            <Linkified text={footer} />
          </p>
        )}
      </div>
    </div>
  );
}
