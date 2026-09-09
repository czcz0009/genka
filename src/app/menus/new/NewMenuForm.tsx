"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMenu } from "../actions.ts";

export function NewMenuForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await createMenu({
      storeId,
      name,
      sellingPrice: sellingPrice.trim() ? Number(sellingPrice) : null,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/menus/${result.menuId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-base">
        メニュー名
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 生姜焼き定食"
          className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-2 text-base">
        売価(円)<span className="text-sm font-normal text-black/40 dark:text-white/40">・あとで入力してもOK</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          placeholder="例: 900"
          className="rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base dark:border-white/20"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-black px-5 py-4 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "登録中…" : "次へ:食材を追加する"}
      </button>
    </form>
  );
}
