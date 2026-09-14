import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm.tsx";

export const metadata: Metadata = {
  title: "パスワード再設定",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-16" style={{ background: "var(--background)" }}>
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
          新しいパスワードを設定
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          新しいパスワードを入力してください。
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
