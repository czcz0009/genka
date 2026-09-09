import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOrCreateStore } from "@/lib/store";
import { NewMenuForm } from "./NewMenuForm.tsx";

export const metadata: Metadata = {
  title: "メニューを登録",
};

export default async function NewMenuPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user || !supabase) redirect("/login");

  const store = await getOrCreateStore(supabase, user.id);
  if (!store) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <p className="text-sm text-red-600 dark:text-red-400">店舗情報の取得に失敗しました。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <p className="text-xs text-black/40 dark:text-white/40">ステップ 1/2</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight">まず、メニューを1つ登録しましょう</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        メニュー名だけでも登録できます。売価はあとからでも入力できます。
      </p>
      <NewMenuForm storeId={store.id} />
    </main>
  );
}
