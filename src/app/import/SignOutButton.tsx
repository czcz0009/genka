"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  if (!supabase) return null;

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="underline underline-offset-2 hover:text-black dark:hover:text-white"
    >
      ログアウト
    </button>
  );
}
