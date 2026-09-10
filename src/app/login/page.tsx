import type { Metadata } from "next";
import { LoginForm } from "./LoginForm.tsx";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1" style={{ background: "var(--background)" }}>
      {/* 左側の紹介パネル(デスクトップのみ)。design-referenceのログイン画面を
          踏襲しているが、スマホ幅では非表示にして既存のモバイル対応を維持する。 */}
      <div
        className="hidden w-80 flex-col justify-between p-10 md:flex"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        <div>
          <div className="mb-8 text-xs font-bold tracking-widest opacity-60">GENKA KANRI</div>
          <div className="text-3xl leading-tight font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)" }}>
            飲食店の
            <br />
            原価管理を
            <br />
            シンプルに
          </div>
          <div className="mt-4 text-sm leading-relaxed opacity-70" style={{ fontFamily: "var(--font-noto-sans-jp)" }}>
            メニューごとの原価率計算、仕入れ値変動アラート、FL比率の月次管理。毎日使える、信頼できる道具。
          </div>
        </div>
        <div className="text-xs opacity-40">© 2026 Genka Kanri</div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
            ログイン
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            メールアドレスとパスワードでログイン、または新規登録してください。
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
