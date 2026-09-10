export type BadgeStatus = "ok" | "warn" | "danger" | "muted";

const STATUS_COLOR: Record<BadgeStatus, string> = {
  ok: "var(--status-ok)",
  warn: "var(--status-warn)",
  danger: "var(--status-danger)",
  muted: "var(--muted-foreground)",
};

/**
 * 「正常/注意/要対応」のような状態を示す小さな丸みのあるバッジ。
 * design-reference のStatusBadgeを踏襲(色はデザイントークンから取得)。
 */
export function StatusBadge({ status, label }: { status: BadgeStatus; label: string }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${color} 15%, var(--card))`, color, fontFamily: "var(--font-noto-sans-jp)" }}
    >
      {label}
    </span>
  );
}
