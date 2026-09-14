"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveStoreSettings } from "./actions.ts";

const INPUT_CLASS = "rounded border px-4 py-3 text-base focus:outline-none focus:ring-2";
const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };
const labelStyle = { color: "var(--foreground)", fontFamily: "var(--font-noto-sans-jp)" };

export function SettingsForm({
  storeId,
  initialName,
  initialDefaultTargetCostRate,
  initialRent,
  month,
}: {
  storeId: string;
  initialName: string;
  initialDefaultTargetCostRate: number;
  initialRent: number | null;
  month: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [targetCostRate, setTargetCostRate] = useState(String(initialDefaultTargetCostRate));
  const [rent, setRent] = useState(initialRent != null ? String(initialRent) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const result = await saveStoreSettings({
      storeId,
      name,
      defaultTargetCostRate: Number(targetCostRate),
      rentAmount: rent.trim() ? Number(rent) : null,
      month,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="mb-4 text-sm font-semibold" style={labelStyle}>
          店舗情報
        </p>
        <label className="flex flex-col gap-2 text-base" style={labelStyle}>
          店舗名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 定食屋たろう"
            className={INPUT_CLASS}
            style={inputStyle}
          />
        </label>
      </div>

      <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="mb-4 text-sm font-semibold" style={labelStyle}>
          目標値
        </p>
        <label className="flex flex-col gap-2 text-base" style={labelStyle}>
          目標原価率(%)
          <input
            type="number"
            min={1}
            max={100}
            step="1"
            inputMode="decimal"
            value={targetCostRate}
            onChange={(e) => setTargetCostRate(e.target.value)}
            className={INPUT_CLASS + " font-mono"}
            style={inputStyle}
          />
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            この数値を超えると、メニュー一覧や「今見直すべきメニュー」で「値上げ検討」として目立つように表示されます。メニューごとに個別の目標を設定していない場合はこの値が使われます(未設定なら30%)。
          </span>
        </label>
      </div>

      <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="mb-4 text-sm font-semibold" style={labelStyle}>
          家賃(月額)
        </p>
        <label className="flex flex-col gap-2 text-base" style={labelStyle}>
          家賃
          <input
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            placeholder="例: 180000(未入力なら変更しません)"
            className={INPUT_CLASS + " font-mono"}
            style={inputStyle}
          />
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            一度設定すれば、金額を変えるまで翌月以降も引き継がれます。
          </span>
        </label>
        {/*
          人件費は月によって金額が変わるため、「設定」に置くと当月分しか
          触れないのに一度きりの設定のように見えて紛らわしい、という指摘を受け、
          月ごとに入力するFL比率画面のみに一本化した(ここには置かない)。
        */}
        <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
          人件費は月ごとに金額が変わるため、ここではなく「FL比率」画面から月を選んで入力してください。
        </p>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm" style={{ color: "var(--status-ok)" }}>
          保存しました
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded px-5 py-4 text-base font-bold transition-colors disabled:opacity-40"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-noto-sans-jp)" }}
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
