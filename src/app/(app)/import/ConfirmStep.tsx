"use client";

import { useState } from "react";
import type { ImportPlan, MenuNameFill } from "@/lib/mapping/applyMapping";
import type { FinalMapping } from "@/lib/mapping/applyMapping";
import { FIELD_DEFS } from "@/lib/mapping/fields";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Notice } from "@/components/Notice.tsx";
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
        <Notice tone="info" title={`メニュー名を${menuNameFills.length}行分、直前の行から自動補完した状態で確定します`}>
          <p className="text-xs opacity-90">
            Excelの結合セルなどで空欄になっていたメニュー名に、直前の値を引き継いでいます。おかしい場合は「マッピングを修正する」に戻って元データを確認してください。
          </p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pl-4 text-xs opacity-90">
            {menuNameFills.map((f, i) => (
              <li key={i}>
                {f.sheetRow}行目 → 「{f.menuName}」({f.filledFromSheetRow}行目より引き継ぎ)
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {conflictCount > 0 && (
        <Notice tone="warn">{conflictCount}件の食材で、単位や仕入単価が行によって食い違っています。内容を確認してください。</Notice>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          メニュー一覧
        </h2>
        <div className="flex flex-col gap-2">
          {plan.menus.map((menu) => (
            <details key={menu.normalizedName} className="rounded border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <summary className="cursor-pointer select-none font-medium" style={{ color: "var(--foreground)" }}>
                {menu.name}
                {menu.sellingPrice != null && (
                  <span className="ml-2 font-mono" style={{ color: "var(--muted-foreground)" }}>
                    売価 ¥{menu.sellingPrice}
                  </span>
                )}
                <span className="ml-2" style={{ color: "var(--muted-foreground)" }}>
                  ({menu.ingredients.length}食材)
                </span>
              </summary>
              <ul className="mt-2 space-y-1 pl-4" style={{ color: "var(--foreground)" }}>
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
        <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" }}>
          食材一覧(重複は統合済み)
        </h2>
        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: "var(--muted)" }}>
              <tr>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>食材名</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>単位</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>仕入単価</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>警告</th>
              </tr>
            </thead>
            <tbody>
              {plan.ingredients.map((ing) => (
                <tr key={ing.normalizedName} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{ing.name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{ing.unit}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>
                    {ing.purchasePrice != null ? `¥${ing.purchasePrice}` : "-"}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--status-warn)" }}>
                    {ing.conflicts.length > 0 ? ing.conflicts.join(" / ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!configured && (
        <Notice tone="info">
          Supabaseプロジェクトが未接続のため、この内容の保存はまだできません。
          <code className="mx-1 rounded px-1 py-0.5" style={{ background: "var(--muted)" }}>.env.local</code>
          を設定すると保存できるようになります。今はJSONとして内容を書き出せます。
        </Notice>
      )}

      {configured && saveState.status === "done" && (
        <Notice tone="ok">
          保存しました。メニュー{saveState.menuCount}件・食材{saveState.ingredientCount}件を登録/更新しました。
          既存の食材・メニューは名前で突き合わせて重複登録せず更新しています。
        </Notice>
      )}
      {configured && saveState.status === "error" && (
        <Notice tone="danger">
          保存に失敗しました: {saveState.message}
          しばらくしてからもう一度お試しください。改善しない場合は「JSONで書き出す」で内容を保存しておくと安心です。
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="rounded border px-4 py-3 text-base"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              マッピングを修正する
            </button>
            <button
              onClick={onStartOver}
              className="rounded px-3 py-3 text-base underline underline-offset-2 transition-colors hover:bg-[color:var(--muted)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              最初からやり直す
            </button>
          </div>
          {configured && storeId && (
            <button
              onClick={handleSave}
              disabled={saveState.status === "saving" || saveState.status === "done"}
              className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
            >
              {saveState.status === "saving"
                ? "保存中…"
                : saveState.status === "done"
                  ? "保存済み"
                  : "この内容を保存する"}
            </button>
          )}
        </div>
        {/* JSON書き出しは確認作業の主目的(保存)とは無関係な補助機能のため、
            保存ボタンと並べて競わせず、控えめなテキストリンクとして分離する */}
        <button
          onClick={downloadPlanAsJson}
          className="self-start rounded px-3 py-2 text-sm underline underline-offset-2 transition-colors hover:bg-[color:var(--muted)]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {downloaded ? "JSONを再度ダウンロード" : "内容をJSONファイルとして保存しておく"}
        </button>
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
  const color =
    tone === "warn" && value > 0 ? "var(--status-danger)" : tone === "ok" ? "var(--status-ok)" : "var(--foreground)";
  return (
    <div className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <p className="font-mono text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
    </div>
  );
}
