type Tone = "info" | "warn" | "danger" | "ok";

const TONE_COLOR: Record<Tone, string> = {
  info: "var(--accent)",
  warn: "var(--status-warn)",
  danger: "var(--status-danger)",
  ok: "var(--status-ok)",
};

/**
 * 色つきの案内ボックス(注意・エラー・補足説明など)を、デザイントークンの
 * 色だけで表現する共通コンポーネント。以前は画面ごとにamber-50/red-50等の
 * 固定Tailwindクラスがバラバラに書かれていたため、見た目だけをここに統一する
 * (文言・表示条件などのロジックは呼び出し側のまま変更していない)。
 */
export function Notice({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className={`rounded border p-4 text-sm ${className}`}
      style={{ background: `color-mix(in srgb, ${color} 10%, var(--card))`, borderColor: color }}
    >
      {title && (
        <p className="font-semibold" style={{ color, fontFamily: "var(--font-noto-sans-jp)" }}>
          {title}
        </p>
      )}
      {children && (
        <div className={title ? "mt-1" : ""} style={{ color: "var(--foreground)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
