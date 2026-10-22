"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IngredientOverviewRow } from "@/lib/marketPrices/buildIngredientOverview.ts";
import { ActionErrorMessage } from "@/components/ActionErrorMessage.tsx";
import { clearProduceOrExcludedLink, excludeIngredientFromMarket, saveProduceMarketLink } from "./actions.ts";

const SUB_BUTTON = "rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40";
const QUIET_LINK = "text-xs underline underline-offset-2 disabled:opacity-40";

/**
 * 追跡状況の行に出す、野菜・果物の対応づけの操作(2026-10-22)。
 * - 推定(確認が必要): 「◯◯で合っている」「違う(比べない)」
 * - 辞書で確定: 控えめに「市場価格と比べない」(産直・契約農家など、市場の値動きと連動しない店向け)
 * - 利用者が確定 / 比べない: 「取り消す」(自動の判定に戻る)
 * 食肉の紐づけは、下の「畜産物の価格アラート対象設定」で行う。
 */
export function ProduceLinkActions({ row }: { row: IngredientOverviewRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: true } | { success: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const id = row.ingredientId;
  let content: React.ReactNode = null;

  if (row.status === "needsReview" && row.produceItemCode) {
    const code = row.produceItemCode;
    content = (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveProduceMarketLink({ ingredientId: id, itemCode: code }))}
          className={SUB_BUTTON}
          style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "var(--card)" }}
        >
          「{row.itemName}」で合っている
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => excludeIngredientFromMarket({ ingredientId: id }))}
          className={SUB_BUTTON}
          style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
        >
          違う(市場価格と比べない)
        </button>
      </div>
    );
  } else if (row.userSetting === "confirmed" || row.userSetting === "excluded") {
    content = (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => clearProduceOrExcludedLink({ ingredientId: id }))}
        className={QUIET_LINK}
        style={{ color: "var(--muted-foreground)" }}
      >
        {row.userSetting === "confirmed" ? "確定を取り消す" : "「比べない」を取り消す"}
      </button>
    );
  } else if (row.status === "tracked" && row.category === "produce") {
    // 辞書で確定した行。誤って押さないよう、推定の行のボタンより控えめにする(取り消しもできる)
    content = (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => excludeIngredientFromMarket({ ingredientId: id }))}
        className={QUIET_LINK}
        style={{ color: "var(--muted-foreground)" }}
      >
        市場価格と比べない
      </button>
    );
  }

  if (!content) return null;
  return (
    <div className="flex w-full flex-col items-start gap-1">
      {content}
      {error && <ActionErrorMessage error={error} />}
    </div>
  );
}
