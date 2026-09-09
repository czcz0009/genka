"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChikusanItemCode } from "@/lib/marketPrices/livestock/chikusanColumns";
import { suggestChikusanItems, type ChikusanItemSuggestion } from "@/lib/marketPrices/livestock/suggestChikusanItem";
import { SearchablePicker } from "@/components/SearchablePicker.tsx";
import { saveIngredientMarketLink, clearIngredientMarketLink } from "./actions.ts";

interface UnlinkedIngredient {
  id: string;
  name: string;
  suggestions: ChikusanItemSuggestion[];
}

interface LinkedIngredient {
  id: string;
  name: string;
  itemCode: ChikusanItemCode;
  itemLabel: string;
}

export function LivestockLinkSettings({
  unlinkedIngredients,
  linkedIngredients,
}: {
  unlinkedIngredients: UnlinkedIngredient[];
  linkedIngredients: LinkedIngredient[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // 確定・解除のたびにページ全体を再計算して待たせるのではなく、画面内の
  // 一覧をその場で更新する(サーバーへの保存はバックグラウンドで行う)。
  // props(サーバー計算結果)が実際に変わった時だけ、これで同期し直す
  // (useEffectで同期すると余分な再レンダリングが発生するため、Reactの
  // 公式ガイド通りレンダー中に直接比較・更新する)。
  const [prevUnlinkedProp, setPrevUnlinkedProp] = useState(unlinkedIngredients);
  const [prevLinkedProp, setPrevLinkedProp] = useState(linkedIngredients);
  const [localUnlinked, setLocalUnlinked] = useState(unlinkedIngredients);
  const [localLinked, setLocalLinked] = useState(linkedIngredients);
  if (unlinkedIngredients !== prevUnlinkedProp || linkedIngredients !== prevLinkedProp) {
    setPrevUnlinkedProp(unlinkedIngredients);
    setPrevLinkedProp(linkedIngredients);
    setLocalUnlinked(unlinkedIngredients);
    setLocalLinked(linkedIngredients);
  }

  async function handleSave(ingredientId: string) {
    const itemCode = selection[ingredientId] as ChikusanItemCode | undefined;
    const target = localUnlinked.find((i) => i.id === ingredientId);
    if (!itemCode || !target) return;
    const itemLabel = target.suggestions.find((s) => s.itemCode === itemCode)?.label ?? "";

    setError(null);
    setSaving(ingredientId);
    // 保存完了を待たず、即座に「確定済み」の表示に切り替える
    setLocalUnlinked((prev) => prev.filter((i) => i.id !== ingredientId));
    setLocalLinked((prev) => [...prev, { id: target.id, name: target.name, itemCode, itemLabel }]);

    const result = await saveIngredientMarketLink({ ingredientId, itemCode });
    setSaving(null);
    if (!result.success) {
      // 失敗した場合だけ表示を元に戻す
      setLocalLinked((prev) => prev.filter((i) => i.id !== ingredientId));
      setLocalUnlinked((prev) => [...prev, target]);
      setError(`${target.name}の保存に失敗しました: ${result.error}`);
      return;
    }
    router.refresh();
  }

  async function handleClear(ingredientId: string) {
    const target = localLinked.find((i) => i.id === ingredientId);
    if (!target) return;

    setError(null);
    setSaving(ingredientId);
    setLocalLinked((prev) => prev.filter((i) => i.id !== ingredientId));
    setLocalUnlinked((prev) => [
      ...prev,
      { id: target.id, name: target.name, suggestions: suggestChikusanItems(target.name) },
    ]);

    const result = await clearIngredientMarketLink({ ingredientId });
    setSaving(null);
    if (!result.success) {
      setLocalUnlinked((prev) => prev.filter((i) => i.id !== ingredientId));
      setLocalLinked((prev) => [...prev, target]);
      setError(`${target.name}の解除に失敗しました: ${result.error}`);
      return;
    }
    router.refresh();
  }

  if (localUnlinked.length === 0 && localLinked.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">畜産物(豚・牛・鶏肉)の価格アラート対象設定</h2>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        「豚肉」「牛肉ロース」のような登録名だけでは、どの規格(和牛A5なのかA4なのか等)の価格に対応するか自動では判断できません。対象にしたい食材があれば、規格を選んで確定してください(未設定の食材は価格アラートの対象になりません)。
      </p>

      {localLinked.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {localLinked.map((i) => (
            <li key={i.id} className="flex items-center justify-between rounded border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              <span>
                {i.name} <span className="text-black/40 dark:text-white/40">→ {i.itemLabel}</span>
              </span>
              <button
                onClick={() => handleClear(i.id)}
                disabled={saving === i.id}
                className="rounded-lg px-3 py-2 text-sm text-black/50 underline underline-offset-2 hover:bg-black/5 hover:text-black disabled:opacity-40 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      )}

      {localUnlinked.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {localUnlinked.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
              <p className="text-base font-medium">{i.name}</p>
              {/*
                以前はここに畜産物の全規格(豚・牛・鶏)を無条件に並べており、
                「牛肉」という食材にまで豚肉の規格が選べてしまう不具合があった。
                i.suggestions はサーバー側(suggestChikusanItems)で食材名から
                判定した畜種(豚/牛/鶏)の規格だけに絞り込み済みなので、
                それだけを選択肢にする。
              */}
              <SearchablePicker
                options={[
                  { value: "", label: "(対象外)" },
                  ...i.suggestions.map((s) => ({
                    value: s.itemCode as string,
                    label: s.label + (i.suggestions[0]?.itemCode === s.itemCode ? " (候補)" : ""),
                  })),
                ]}
                value={selection[i.id] ?? ""}
                onChange={(v) => setSelection({ ...selection, [i.id]: v })}
                searchPlaceholder="規格名で絞り込む"
                selectedLabelPrefix="選択中の規格"
              />
              <button
                onClick={() => handleSave(i.id)}
                disabled={saving === i.id || !selection[i.id]}
                className="self-start rounded-lg border border-black/15 px-4 py-2.5 text-sm font-medium disabled:opacity-40 dark:border-white/20"
              >
                確定
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
