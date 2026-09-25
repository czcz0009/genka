/** アプリ本体の新規登録・ログイン画面(「使ってみる」の遷移先) */
const APP_URL = 'https://genka-one.vercel.app/login'
/** ご質問・ご感想の受付先(Googleフォーム・mailto・LINEなど)。未定の間は空にする */
const CONTACT_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfKevfXMlqDf8deogpss-HfgUCqTz5-fKUyNO4eUrGu7-f7Lw/viewform'

const SHOT = `${import.meta.env.BASE_URL}screenshots/`

/* ─── 共通パーツ ─── */
function Logo({ small = false }: { small?: boolean }) {
  const box = small ? 'w-5 h-5 rounded' : 'w-7 h-7 rounded-md'
  const icon = small ? 10 : 16
  return (
    <div className="flex items-center gap-2">
      <div className={`${box} bg-navy-800 flex items-center justify-center`}>
        <svg width={icon} height={icon} viewBox="0 0 16 16" fill="none">
          <path d="M3 11.5L7 5l3 4 2-2.5 3 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className={`font-bold tracking-tight ${small ? 'text-xs text-navy-200' : 'text-sm text-navy-900'}`}>ゲンカル</span>
    </div>
  )
}

/** ブラウザ枠つきのスクリーンショット。クリックで原寸を開く */
function BrowserShot({
  src,
  alt,
  className = '',
  aspect,
}: {
  src: string
  alt: string
  className?: string
  /** 指定すると、この縦横比で上側を残して切り取る(カードの高さをそろえるため) */
  aspect?: string
}) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${alt}(原寸で開く)`}
      className={`block rounded-xl border border-navy-100 bg-white shadow-xl shadow-navy-900/10 overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-1.5 bg-navy-50 border-b border-navy-100 px-3 py-1.5">
        <span className="w-2 h-2 rounded-full bg-navy-200" />
        <span className="w-2 h-2 rounded-full bg-navy-200" />
        <span className="w-2 h-2 rounded-full bg-navy-200" />
      </div>
      <div style={aspect ? { aspectRatio: aspect } : undefined} className={aspect ? 'overflow-hidden' : ''}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={aspect ? 'w-full h-full object-cover object-top block' : 'w-full h-auto block'}
        />
      </div>
    </a>
  )
}

function CtaButton({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <a
      href={APP_URL}
      className={`inline-flex items-center justify-center gap-1.5 font-bold text-sm px-7 py-3 rounded-lg transition-colors shadow-sm ${
        dark ? 'bg-white text-navy-900 hover:bg-navy-50' : 'bg-accent-cta hover:bg-accent-cta-hover text-white'
      }`}
    >
      {children}
    </a>
  )
}

/* ─── Nav ─── */
function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-navy-100">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-ink-muted">
          <a href="#scan" className="hover:text-navy-900">納品書の読み取り</a>
          <a href="#features" className="hover:text-navy-900">機能</a>
          <a href="#steps" className="hover:text-navy-900">使い方</a>
          <a href="#faq" className="hover:text-navy-900">よくある質問</a>
        </nav>
        <a
          href={APP_URL}
          className="text-xs font-bold text-white bg-accent-cta hover:bg-accent-cta-hover rounded-md px-3.5 py-2 transition-colors"
        >
          無料で使ってみる
        </a>
      </div>
    </header>
  )
}

/* ─── 1. Hero ─── */
function Hero() {
  return (
    <section className="bg-gradient-to-b from-navy-50 to-white pt-10 pb-12 lg:pt-16 lg:pb-16 px-4 overflow-hidden">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] gap-10 lg:gap-12 items-center">
        <div className="text-center lg:text-left">
          <span className="inline-block text-[11px] font-bold tracking-widest text-navy-600 bg-white border border-navy-100 rounded-full px-3 py-1 mb-5">
            個人飲食店向け ・ 原価計算 &amp; 値付け
          </span>
          <h1 className="text-[1.9rem] sm:text-[2.2rem] lg:text-[2.35rem] leading-[1.25] font-black text-navy-900 tracking-tight mb-4">
            値上げのタイミングを、
            <br />
            勝手に教えてくれる。
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-6">
            納品書を撮るだけで仕入単価を更新。
            <br className="hidden sm:inline" />
            原価率が高いメニューを、優先度順に並べてお知らせします。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <CtaButton>無料で使ってみる →</CtaButton>
            <a href="#scan" className="text-sm font-medium text-navy-700 hover:text-navy-900 underline underline-offset-4 decoration-navy-200">
              納品書の読み取りを見る
            </a>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            β版につき現在無料 ・ メールアドレスとパスワードですぐ登録 ・ スマホ/PC対応
          </p>
        </div>

        <BrowserShot src={`${SHOT}ranking.png`} alt="値上げを検討すべきメニューが優先度順に並ぶ「今見直すべきメニュー」画面" />
      </div>
    </section>
  )
}

/* ─── 2. 悩み(1行帯) ─── */
const problems = [
  { text: '原価率が、どんぶり勘定になっていませんか' },
  { text: '仕入れ値が上がったのに、気づかず利益が削られていませんか' },
  { text: '原価計算のExcel入力で、一日が終わっていませんか' },
]

function Problems() {
  return (
    <section className="bg-navy-950 py-8 lg:py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-xs font-bold tracking-widest text-navy-200 mb-4">こんな悩み、ありませんか?</p>
        <div className="grid md:grid-cols-3 gap-3">
          {problems.map((p) => (
            <div key={p.text} className="flex items-center gap-3 bg-navy-900 border border-navy-700 rounded-lg px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-[13px] text-slate-200 leading-snug">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── 3. 納品書の読み取り(目玉機能) ─── */
function Scan() {
  return (
    <section id="scan" className="bg-white py-12 lg:py-16 px-4 scroll-mt-14">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-8">
          <span className="text-xs font-bold tracking-[0.2em] text-navy-500 font-mono">PICK UP</span>
          <h2 className="text-2xl lg:text-3xl font-black text-navy-900 mt-1 leading-snug">
            納品書を撮るだけで、仕入単価が更新
          </h2>
          <p className="text-sm lg:text-base text-ink-muted leading-[1.8] mt-3">
            納品書・請求書の写真をアップロードすると、AIが食材名・数量・単価を読み取ります。
            登録済みの食材なら単価を更新、新しい食材なら追加。単位が違えば(kg↔gなど)自動で換算します。
            読み取り結果は必ず画面で確認してから登録するので、間違いも直せます。
          </p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,5fr)_auto_minmax(0,6fr)] gap-4 lg:gap-5 items-center">
          {/* 納品書 */}
          <figure className="mx-auto w-full max-w-md lg:max-w-none">
            <figcaption className="text-xs font-bold text-navy-700 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-navy-800 text-white text-[10px] flex items-center justify-center">1</span>
              納品書を撮る(サンプル)
            </figcaption>
            <div className="rounded-lg border border-navy-100 bg-white shadow-md overflow-hidden rotate-[-1.2deg]">
              <img src={`${SHOT}invoice.png`} alt="読み取り対象の納品書のサンプル(品目・数量・単価・金額が印刷されている)" loading="lazy" className="w-full h-auto block" />
            </div>
          </figure>

          {/* 矢印 */}
          <div className="flex lg:flex-col items-center justify-center gap-1 text-accent-cta">
            <svg className="rotate-90 lg:rotate-0" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span className="text-[10px] font-bold tracking-widest">AIが読み取り</span>
          </div>

          {/* 読み取り結果 */}
          <figure className="mx-auto w-full max-w-md lg:max-w-none">
            <figcaption className="text-xs font-bold text-navy-700 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-navy-800 text-white text-[10px] flex items-center justify-center">2</span>
              確認して登録(実際の画面)
            </figcaption>
            <BrowserShot src={`${SHOT}scan-result.png`} alt="AIが読み取った食材名・単位・単価を確認・修正する画面。単位が違う場合は警告が出る" />
          </figure>
        </div>

        <p className="mt-5 text-xs text-ink-faint leading-relaxed">
          ※ 対象は印刷された納品書・請求書です(手書きの伝票は対象外)。登録済みの食材と名前が違う場合は、登録先を選んでいただきます。
        </p>
      </div>
    </section>
  )
}

/* ─── 4. 機能(格子状) ─── */
function Features() {
  return (
    <section id="features" className="bg-surface py-12 lg:py-16 px-4 scroll-mt-14">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-8">
          <span className="text-xs font-bold tracking-[0.2em] text-navy-500 font-mono">FEATURES</span>
          <h2 className="text-2xl lg:text-3xl font-black text-navy-900 mt-1">「今どこを直すべきか」が、ひと目で分かる</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <FeatureCard
            title="今見直すべきメニュー"
            body="原価率が目標を超えているメニューを、値上げ効果の大きい順に表示。値上げの目安額もその場で分かります。仕入れ値の変動による月間の影響額も出ます。"
          >
            <BrowserShot src={`${SHOT}ranking.png`} alt="今見直すべきメニュー画面" aspect="16/9" />
          </FeatureCard>

          <FeatureCard
            title="メニューごとの原価率を自動計算"
            body="食材とレシピを登録すれば、原価・原価率が自動で並びます。目標より高いメニューは色でひと目。メニューごとに目標原価率も設定できます。"
          >
            <BrowserShot src={`${SHOT}menus.png`} alt="メニュー一覧と原価率の画面" aspect="16/9" />
          </FeatureCard>

          <FeatureCard
            title="FL比率・FLR比率と、実質原価率"
            body="食材原価に人件費・家賃を含めた、お店全体の経営状態を月ごとに確認。ロス・値引きを加味した「実質原価率」で、肌感覚とのズレも把握できます。"
          >
            <BrowserShot src={`${SHOT}fl-ratio.png`} alt="FL比率・FLR比率・理論原価率・実質原価率の画面" aspect="16/9" />
          </FeatureCard>

          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 flex flex-col justify-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-alert-amber flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-navy-900">仕入れ値アラート</h3>
            <p className="text-sm text-ink-muted leading-[1.8]">
              野菜(青果物)や肉(畜産物)の市場価格が大きく動いたとき、アプリを開くと画面上でお知らせします。値上がりに気づく前に、原価への影響を確認できます。
            </p>
            <p className="text-xs text-ink-faint leading-relaxed border-l-2 border-amber-200 pl-3">
              畜産物は東京市場、青果物は全国主要卸売市場の価格を参考値として使用(実際の仕入れ値そのものではありません)
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-navy-100 p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-black text-navy-900">{title}</h3>
        <p className="text-sm text-ink-muted leading-[1.75] mt-1.5">{body}</p>
      </div>
      {children}
    </div>
  )
}

/* ─── 5. 使い方(3ステップ) ─── */
const steps = [
  { n: '1', title: 'メニューと食材を登録', body: '手入力のほか、ExcelやCSVの取り込みにも対応。列の対応づけは自動で行います(結合セルにも対応)。' },
  { n: '2', title: '納品書を撮って、単価を更新', body: '撮影した写真から仕入単価を読み取り、確認して保存。仕入れ値が変わるたび、原価率も自動で再計算されます。' },
  { n: '3', title: '見直すメニューが並ぶ', body: '原価率が高いメニューが優先度順に並び、値上げの目安額も表示されます。' },
]

function Steps() {
  return (
    <section id="steps" className="bg-white py-12 lg:py-14 px-4 scroll-mt-14">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-black text-navy-900 mb-6">使い方は、3ステップ</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-navy-100 bg-surface px-5 py-4 flex gap-4 items-start">
              <span className="shrink-0 w-8 h-8 rounded-full bg-navy-800 text-white text-sm font-black flex items-center justify-center font-mono">{s.n}</span>
              <div>
                <p className="text-sm font-bold text-navy-900">{s.title}</p>
                <p className="text-xs text-ink-muted leading-relaxed mt-1">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── 6. FAQ ─── */
const faqs = [
  { q: '料金はかかりますか?', a: 'β版の期間中は無料でお使いいただけます。将来の料金体系は未定です。' },
  { q: '納品書の読み取りは、間違えませんか?', a: '読み取り結果は自動では確定せず、必ず画面で確認・修正してから登録します。自信のない箇所には「要確認」が付きます。' },
  { q: '手書きの伝票でも読み取れますか?', a: '印刷された納品書・請求書が対象です。手書きの伝票は対象外です。' },
  { q: '撮影した写真は保存されますか?', a: '読み取りのために一時的にAIサービスへ送信しますが、ゲンカルのサーバーには保存しません。' },
  { q: '読み取りに回数の制限はありますか?', a: 'β版の期間中は、コスト管理のため、納品書の読み取りは1アカウントあたり3回までとしています(読み取りに成功した回数を数えます)。ExcelやCSVの取り込み、手入力は、この回数に含まれません。' },
  { q: 'レジや会計ソフトとの連携は必要ですか?', a: '必要ありません。納品書の写真か、Excel・CSV、手入力だけで始められます。' },
]

function Faq() {
  return (
    <section id="faq" className="bg-surface py-12 lg:py-14 px-4 scroll-mt-14">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-black text-navy-900 mb-6">よくある質問</h2>
        <div className="flex flex-col gap-2.5">
          {faqs.map((f) => (
            <details key={f.q} className="group bg-white border border-navy-100 rounded-lg px-4 py-3">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-bold text-navy-900">
                {f.q}
                <span className="shrink-0 text-navy-500 transition-transform group-open:rotate-45 text-lg leading-none">+</span>
              </summary>
              <p className="text-sm text-ink-muted leading-[1.75] mt-2.5">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── 7. 最後のCTA ─── */
function Contact() {
  return (
    <section id="contact" className="bg-navy-900 py-14 px-4 scroll-mt-14">
      <div className="max-w-2xl mx-auto text-center">
        <span className="inline-block text-[11px] font-bold tracking-widest text-amber-200 border border-amber-200/40 rounded-full px-3 py-1 mb-4">
          β版 提供中
        </span>
        <h2 className="text-2xl font-black text-white mb-3">まずは、メニューを1品登録するところから</h2>
        <p className="text-sm text-navy-200 leading-relaxed mb-7">
          実際に飲食店を営む方に無料でお使いいただきながら、改善を重ねています。気になる点は、率直にお聞かせください。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <CtaButton dark>無料で使ってみる →</CtaButton>
          {CONTACT_URL && (
            <a
              href={CONTACT_URL}
              className="text-sm text-navy-200 underline underline-offset-4 hover:text-white transition-colors"
            >
              ご質問・ご感想はこちら
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="bg-navy-950 py-7 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Logo small />
          <p className="text-xs text-navy-400">© 2026</p>
        </div>
        <div className="text-xs text-navy-400 leading-relaxed space-y-1">
          <p>運営: ゲンカル運営(個人開発)。現在はβ版として無料で提供しています。</p>
          <p>
            お問い合わせフォームにご入力いただいた内容(メールアドレスを含む)は、ご質問・ご感想への返信と、サービス改善の目的にのみ使用し、第三者へは提供しません。
          </p>
          {CONTACT_URL && (
            <p>
              <a href={CONTACT_URL} className="underline hover:text-navy-200">
                お問い合わせフォーム
              </a>
            </p>
          )}
        </div>
      </div>
    </footer>
  )
}

/* ─── Root ─── */
export default function App() {
  return (
    <div className="min-h-screen bg-surface font-sans">
      <Nav />
      <main>
        <Hero />
        <Problems />
        <Scan />
        <Features />
        <Steps />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}
