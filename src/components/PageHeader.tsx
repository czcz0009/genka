/**
 * 各画面共通の見出しブロック(小さな分類ラベル + 大見出し + 任意の説明文)。
 * design-referenceの各画面(メニュー管理・収益ランキング等)の見出しパターンを
 * そのまま共通化したもの。
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  /** 見出しの右に添える補助的な操作(ヘルプボタン等)。省略可。 */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
        {eyebrow}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)", color: "var(--foreground)" }}>
          {title}
        </h1>
        {actions}
      </div>
      {description && (
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {description}
        </p>
      )}
    </div>
  );
}
