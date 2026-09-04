import type { Metadata } from "next";
import { LoginForm } from "./LoginForm.tsx";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-xl font-bold tracking-tight">ログイン</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        メールアドレスとパスワードでログイン、または新規登録してください。
      </p>
      <LoginForm />
    </main>
  );
}
