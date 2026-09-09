import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { ImportWizard } from "./ImportWizard.tsx";
import { SignOutButton } from "./SignOutButton.tsx";

export const metadata: Metadata = {
  title: "レシピ・仕入れデータの取り込み",
};

export default async function ImportPage() {
  let storeId: string | null = null;
  let userEmail: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

    if (!user) {
      redirect("/login");
    }

    userEmail = user.email ?? null;
    const store = supabase ? await getOrCreateStore(supabase, user.id) : null;
    storeId = store?.id ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">レシピ・仕入れデータの取り込み</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Excelやスプレッドシートで管理してる表(CSV/Excelファイル)をアップロードすると、どの列が何を表しているか自動で推測します。内容を確認・修正してから確定してください。
          </p>
          <p className="mt-1 text-sm">
            <Link href="/menus/new" className="text-black/50 underline underline-offset-2 hover:text-black dark:text-white/50 dark:hover:text-white">
              表がない場合は手入力で始める
            </Link>
          </p>
        </div>
        {userEmail && (
          <div className="flex items-center gap-3 text-xs text-black/50 dark:text-white/50">
            <span>{userEmail}</span>
            <SignOutButton />
          </div>
        )}
      </div>
      <ImportWizard storeId={storeId} />
    </main>
  );
}
