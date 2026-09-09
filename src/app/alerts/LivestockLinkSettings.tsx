"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHIKUSAN_COLUMNS, type ChikusanItemCode } from "@/lib/marketPrices/livestock/chikusanColumns";
import type { ChikusanItemSuggestion } from "@/lib/marketPrices/livestock/suggestChikusanItem";
import { saveIngredientMarketLink, clearIngredientMarketLink } from "./actions.ts";

const PRICED_COLUMNS = CHIKUSAN_COLUMNS.filter((c) => c.itemCode);

export function LivestockLinkSettings({
  unlinkedIngredients,
  linkedIngredients,
}: {
  unlinkedIngredients: { id: string; name: string; suggestions: ChikusanItemSuggestion[] }[];
  linkedIngredients: { id: string; name: string; itemCode: ChikusanItemCode; itemLabel: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  async function handleSave(ingredientId: string) {
    const itemCode = selection[ingredientId];
    if (!itemCode) return;
    setSaving(ingredientId);
    await saveIngredientMarketLink({ ingredientId, itemCode: itemCode as ChikusanItemCode });
    setSaving(null);
    router.refresh();
  }

  async function handleClear(ingredientId: string) {
    setSaving(ingredientId);
    await clearIngredientMarketLink({ ingredientId });
    setSaving(null);
    router.refresh();
  }

  if (unlinkedIngredients.length === 0 && linkedIngredients.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">畜産物(豚・牛・鶏肉)の価格アラート対象設定</h2>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        「豚肉」「牛肉ロース」のような登録名だけでは、どの規格(和牛A5なのかA4なのか等)の価格に対応するか自動では判断できません。対象にしたい食材があれば、規格を選んで確定してください(未設定の食材は価格アラートの対象になりません)。
      </p>

      {linkedIngredients.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {linkedIngredients.map((i) => (
            <li key={i.id} className="flex items-center justify-between rounded border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              <span>
                {i.name} <span className="text-black/40 dark:text-white/40">→ {i.itemLabel}</span>
              </span>
              <button
                onClick={() => handleClear(i.id)}
                disabled={saving === i.id}
                className="text-xs text-black/50 underline underline-offset-2 hover:text-black disabled:opacity-40 dark:text-white/50 dark:hover:text-white"
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      )}

      {unlinkedIngredients.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {unlinkedIngredients.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              <span className="w-full sm:w-auto sm:flex-1">{i.name}</span>
              <select
                value={selection[i.id] ?? ""}
                onChange={(e) => setSelection({ ...selection, [i.id]: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm sm:flex-none dark:border-white/20"
              >
                <option value="">(対象外)</option>
                {PRICED_COLUMNS.map((c) => (
                  <option key={c.itemCode} value={c.itemCode!}>
                    {c.label}
                    {i.suggestions[0]?.itemCode === c.itemCode ? " (候補)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSave(i.id)}
                disabled={saving === i.id || !selection[i.id]}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
              >
                確定
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
