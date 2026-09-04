"use client";

import { useState } from "react";
import type { ImportPlan, MenuNameFill } from "@/lib/mapping/applyMapping";
import type { FinalMapping } from "@/lib/mapping/applyMapping";
import { FIELD_DEFS } from "@/lib/mapping/fields";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { saveImportPlan } from "./actions.ts";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; menuCount: number; ingredientCount: number }
  | { status: "error"; message: string };

export function ConfirmStep({
  storeId,
  fileName,
  plan,
  errorCount,
  menuNameFills,
  columnMapping,
  headers,
  onBack,
  onStartOver,
}: {
  storeId: string | null;
  fileName: string;
  plan: ImportPlan;
  errorCount: number;
  menuNameFills: MenuNameFill[];
  columnMapping: FinalMapping;
  headers: string[];
  onBack: () => void;
  onStartOver: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const conflictCount = plan.ingredients.filter((i) => i.conflicts.length > 0).length;
  const configured = isSupabaseConfigured();

  async function handleSave() {
    if (!storeId) return;
    setSaveState({ status: "saving" });
    const result = await saveImportPlan({
      storeId,
      fileName,
      columnMapping,
      headers,
      errorCount,
      plan,
    });
    setSaveState(
      result.success
        ? { status: "done", menuCount: result.menuCount, ingredientCount: result.ingredientCount }
        : { status: "error", message: result.error },
    );
  }

  function downloadPlanAsJson() {
    const mappingSummary = Object.fromEntries(
      FIELD_DEFS.map((f) => [
        f.label,
        columnMapping[f.id] != null ? headers[columnMapping[f.id] as number] : null,
      ]),
    );
    const payload = { fileName, columnMapping: mappingSummary, plan };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "")}_import_plan.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <SummaryCard label="メニュー" value={plan.menus.length} />
        <SummaryCard label="食材(重複統合後)" value={plan.ingredients.length} />
        <SummaryCard label="除外したエラー行" value={errorCount} tone={errorCount > 0 ? "warn" : "ok"} />
      </div>

      {menuNameFills.length > 0 && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 text-sm dark:border-blue-700/70 dark:bg-blue-900/20">
          <p className="font-semibold text-blue-900 dark:text-blue-200">
            メニュー名を{menuNameFills.length}行分、直前の行から自動補完した状態で確定します
          </p>
          <p className="mt-1 text-blue-800/80 dark:text-blue-300/80">
            Excelの結合セルなどで空欄になっていたメニュー名に、直前の値を引き継いでいます。おかしい場合は「マッピングを修正する」に戻って元データを確認してください。
          </p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pl-4 text-xs text-blue-900/90 dark:text-blue-200/90">
            {menuNameFills.map((f, i) => (
              <li key={i}>
                {f.sheetRow}行目 → 「{f.menuName}」({f.filledFromSheetRow}行目より引き継ぎ)
              </li>
            ))}
          </ul>
        </div>
      )}

      {conflictCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {conflictCount}件の食材で、単位や仕入単価が行によって食い違っています。内容を確認してください。
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">メニュー一覧</h2>
        <div className="flex flex-col gap-2">
          {plan.menus.map((menu) => (
            <details key={menu.normalizedName} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
              <summary className="cursor-pointer select-none font-medium">
                {menu.name}
                {menu.sellingPrice != null && (
                  <span className="ml-2 text-black/50 dark:text-white/50">売価 ¥{menu.sellingPrice}</span>
                )}
                <span className="ml-2 text-black/40 dark:text-white/40">({menu.ingredients.length}食材)</span>
              </summary>
              <ul className="mt-2 space-y-1 pl-4 text-black/70 dark:text-white/70">
                {menu.ingredients.map((mi, idx) => {
                  const ing = plan.ingredients.find((i) => i.normalizedName === mi.ingredientNormalizedName);
                  return (
                    <li key={idx}>
                      {ing?.name ?? mi.ingredientNormalizedName} — {mi.quantity}
                      {mi.unit}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">食材一覧(重複は統合済み)</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 font-medium">食材名</th>
                <th className="px-3 py-2 font-medium">単位</th>
                <th className="px-3 py-2 font-medium">仕入単価</th>
                <th className="px-3 py-2 font-medium">警告</th>
              </tr>
            </thead>
            <tbody>
              {plan.ingredients.map((ing) => (
                <tr key={ing.normalizedName} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-3 py-2">{ing.name}</td>
                  <td className="px-3 py-2">{ing.unit}</td>
                  <td className="px-3 py-2">{ing.purchasePrice != null ? `¥${ing.purchasePrice}` : "-"}</td>
                  <td className="px-3 py-2 text-amber-700 dark:text-amber-400">
                    {ing.conflicts.length > 0 ? ing.conflicts.join(" / ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!configured && (
        <div className="rounded-lg border border-black/10 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          Supabaseプロジェクトが未接続のため、この内容の保存はまだできません。
          <code className="mx-1 rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.local</code>
          を設定すると保存できるようになります。今はJSONとして内容を書き出せます。
        </div>
      )}

      {configured && saveState.status === "done" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          保存しました。メニュー{saveState.menuCount}件・食材{saveState.ingredientCount}件を登録/更新しました。
          既存の食材・メニューは名前で突き合わせて重複登録せず更新しています。
        </div>
      )}
      {configured && saveState.status === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          保存に失敗しました: {saveState.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/20"
          >
            マッピングを修正する
          </button>
          <button
            onClick={onStartOver}
            className="text-sm text-black/50 underline underline-offset-2 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            最初からやり直す
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={downloadPlanAsJson}
            className="rounded-lg border border-black/15 px-5 py-2.5 text-sm font-medium dark:border-white/20"
          >
            {downloaded ? "再度ダウンロード" : "JSONで書き出す"}
          </button>
          {configured && storeId && (
            <button
              onClick={handleSave}
              disabled={saveState.status === "saving" || saveState.status === "done"}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {saveState.status === "saving"
                ? "保存中…"
                : saveState.status === "done"
                  ? "保存済み"
                  : "この内容を保存する"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn" && value > 0
      ? "text-red-600 dark:text-red-400"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-400"
        : "";
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">{label}</p>
    </div>
  );
}
