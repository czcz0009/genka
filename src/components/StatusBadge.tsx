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
export function StatusBadge({
  status,
  label,
  wrap = false,
}: {
  status: BadgeStatus;
  label: string;
  /**
   * 長い文言のバッジを、狭い場所(スマホ幅の2列カード等)で折り返せるようにする。
   * 既定(false)は1行固定。折り返すと2行になるため、角の丸みを控えめにする。
   */
  wrap?: boolean;
}) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className={`${wrap ? "max-w-full rounded-lg" : "whitespace-nowrap rounded-full"} px-2 py-0.5 text-xs font-medium`}
      style={{ background: `color-mix(in srgb, ${color} 15%, var(--card))`, color, fontFamily: "var(--font-noto-sans-jp)" }}
    >
      {label}
    </span>
  );
}
