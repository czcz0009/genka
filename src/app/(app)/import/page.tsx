import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionStore } from "@/lib/store";
import { ImportWizard } from "./ImportWizard.tsx";
import { SignOutButton } from "@/components/SignOutButton.tsx";
import { PageHeader } from "@/components/PageHeader.tsx";

export const metadata: Metadata = {
  title: "レシピ・仕入れデータの取り込み",
};

export default async function ImportPage() {
  let storeId: string | null = null;
  let userEmail: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);

    if (!user) {
      redirect("/login");
    }

    userEmail = user.email ?? null;
    // このページはメールアドレス表示のためgetAuthUser自体は引き続き必要だが、
    // 店舗の取得はgetSessionStore(RPC1回)にまとめている。
    const session = supabase ? await getSessionStore(supabase) : ({ status: "unauthenticated" } as const);
    storeId = session.status === "ok" ? session.store.id : null;
  }

  return (
    <div className="max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="データ取り込み"
          title="レシピ・仕入れデータの取り込み"
          description={
            <>
              Excelやスプレッドシートで管理してる表(CSV/Excelファイル)をアップロードすると、どの列が何を表しているか自動で推測します。内容を確認・修正してから確定してください。
              <br />
              <Link
                href="/menus/new"
                prefetch={false}
                className="underline underline-offset-2"
                style={{ color: "var(--accent)" }}
              >
                表がない場合は手入力で始める
              </Link>
            </>
          }
        />
        {userEmail && (
          <div className="flex shrink-0 items-center gap-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>{userEmail}</span>
            <SignOutButton />
          </div>
        )}
      </div>
      <ImportWizard storeId={storeId} />
    </div>
  );
}
