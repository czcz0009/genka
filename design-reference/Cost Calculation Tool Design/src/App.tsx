import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type Screen =
  | "login"
  | "register"
  | "dashboard"
  | "menus"
  | "menu-edit"
  | "csv"
  | "ranking"
  | "fl"
  | "alerts"
  | "settings";

interface Ingredient {
  id: string;
  name: string;
  cost: number;
  unit: string;
  amount: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  ingredients: Ingredient[];
  monthlySales: number;
}

interface Alert {
  id: string;
  ingredient: string;
  category: "青果物" | "畜産物" | "水産物";
  prevPrice: number;
  currentPrice: number;
  changeRate: number;
  affectedMenus: string[];
  date: string;
}

interface MonthlyFL {
  month: string;
  foodCostRate: number;
  laborCostRate: number;
  flRate: number;
  flrRate: number;
  sales: number;
}

// ── Initial Data ───────────────────────────────────────────────────────────
const initialMenus: MenuItem[] = [
  {
    id: "1",
    name: "唐揚げ定食",
    price: 950,
    monthlySales: 312,
    ingredients: [
      { id: "i1", name: "鶏もも肉", cost: 280, unit: "g", amount: 200 },
      { id: "i2", name: "米", cost: 180, unit: "g", amount: 200 },
      { id: "i3", name: "キャベツ", cost: 120, unit: "g", amount: 100 },
      { id: "i4", name: "調味料", cost: 80, unit: "式", amount: 1 },
    ],
  },
  {
    id: "2",
    name: "豚生姜焼き定食",
    price: 880,
    monthlySales: 248,
    ingredients: [
      { id: "i5", name: "豚ロース", cost: 320, unit: "g", amount: 160 },
      { id: "i6", name: "米", cost: 180, unit: "g", amount: 200 },
      { id: "i7", name: "たまねぎ", cost: 150, unit: "g", amount: 80 },
      { id: "i8", name: "調味料", cost: 60, unit: "式", amount: 1 },
    ],
  },
  {
    id: "3",
    name: "野菜炒め定食",
    price: 780,
    monthlySales: 186,
    ingredients: [
      { id: "i9", name: "豚バラ", cost: 260, unit: "g", amount: 80 },
      { id: "i10", name: "キャベツ", cost: 120, unit: "g", amount: 150 },
      { id: "i11", name: "にんじん", cost: 90, unit: "g", amount: 60 },
      { id: "i12", name: "米", cost: 180, unit: "g", amount: 200 },
    ],
  },
  {
    id: "4",
    name: "サバ味噌煮定食",
    price: 830,
    monthlySales: 144,
    ingredients: [
      { id: "i13", name: "サバ", cost: 380, unit: "g", amount: 160 },
      { id: "i14", name: "米", cost: 180, unit: "g", amount: 200 },
      { id: "i15", name: "みそ", cost: 60, unit: "g", amount: 30 },
    ],
  },
  {
    id: "5",
    name: "麻婆豆腐定食",
    price: 820,
    monthlySales: 203,
    ingredients: [
      { id: "i16", name: "豆腐", cost: 80, unit: "丁", amount: 1 },
      { id: "i17", name: "豚ひき肉", cost: 240, unit: "g", amount: 80 },
      { id: "i18", name: "米", cost: 180, unit: "g", amount: 200 },
      { id: "i19", name: "調味料", cost: 90, unit: "式", amount: 1 },
    ],
  },
  {
    id: "6",
    name: "ハンバーグ定食",
    price: 1050,
    monthlySales: 278,
    ingredients: [
      { id: "i20", name: "合いびき肉", cost: 420, unit: "g", amount: 180 },
      { id: "i21", name: "たまねぎ", cost: 150, unit: "g", amount: 60 },
      { id: "i22", name: "米", cost: 180, unit: "g", amount: 200 },
      { id: "i23", name: "調味料", cost: 100, unit: "式", amount: 1 },
    ],
  },
];

const initialAlerts: Alert[] = [
  {
    id: "a1",
    ingredient: "たまねぎ",
    category: "青果物",
    prevPrice: 150,
    currentPrice: 218,
    changeRate: 45.3,
    affectedMenus: ["豚生姜焼き定食", "ハンバーグ定食"],
    date: "2026-09-09",
  },
  {
    id: "a2",
    ingredient: "キャベツ",
    category: "青果物",
    prevPrice: 120,
    currentPrice: 165,
    changeRate: 37.5,
    affectedMenus: ["唐揚げ定食", "野菜炒め定食"],
    date: "2026-09-08",
  },
  {
    id: "a3",
    ingredient: "鶏もも肉",
    category: "畜産物",
    prevPrice: 280,
    currentPrice: 310,
    changeRate: 10.7,
    affectedMenus: ["唐揚げ定食"],
    date: "2026-09-07",
  },
];

const monthlyFLData: MonthlyFL[] = [
  { month: "4月", foodCostRate: 32.1, laborCostRate: 28.4, flRate: 60.5, flrRate: 71.2, sales: 2180000 },
  { month: "5月", foodCostRate: 31.8, laborCostRate: 27.9, flRate: 59.7, flrRate: 70.8, sales: 2340000 },
  { month: "6月", foodCostRate: 33.2, laborCostRate: 28.1, flRate: 61.3, flrRate: 72.1, sales: 2120000 },
  { month: "7月", foodCostRate: 34.5, laborCostRate: 29.2, flRate: 63.7, flrRate: 74.5, sales: 1980000 },
  { month: "8月", foodCostRate: 33.8, laborCostRate: 28.7, flRate: 62.5, flrRate: 73.2, sales: 2060000 },
  { month: "9月", foodCostRate: 35.2, laborCostRate: 28.4, flRate: 63.6, flrRate: 74.8, sales: 2240000 },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function calcCost(menu: MenuItem): number {
  return menu.ingredients.reduce((sum, ing) => {
    return sum + (ing.cost / 1000) * ing.amount;
  }, 0);
}

function calcCostRate(menu: MenuItem): number {
  const cost = calcCost(menu);
  return (cost / menu.price) * 100;
}

function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

function statusColor(rate: number, target: number) {
  if (rate <= target) return "ok";
  if (rate <= target + 5) return "warn";
  return "danger";
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusDot({ status }: { status: "ok" | "warn" | "danger" }) {
  const colors = {
    ok: "bg-[color:var(--status-ok)]",
    warn: "bg-[color:var(--status-warn)]",
    danger: "bg-[color:var(--status-danger)]",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

function StatusBadge({ status, label }: { status: "ok" | "warn" | "danger"; label: string }) {
  const styles = {
    ok: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
    danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded ${styles[status]}`}>
      <StatusDot status={status} />
      {label}
    </span>
  );
}

// ── Sidebar Nav ────────────────────────────────────────────────────────────
const navItems: { id: Screen; label: string; icon: string }[] = [
  { id: "dashboard", label: "ダッシュボード", icon: "⊞" },
  { id: "menus", label: "メニュー管理", icon: "≡" },
  { id: "csv", label: "CSV取り込み", icon: "↑" },
  { id: "ranking", label: "収益ランキング", icon: "▲" },
  { id: "fl", label: "FL比率", icon: "∿" },
  { id: "alerts", label: "仕入れ値アラート", icon: "!" },
  { id: "settings", label: "設定", icon: "⚙" },
];

function Sidebar({
  current,
  onNav,
  alertCount,
  dark,
  onToggleDark,
  storeName,
}: {
  current: Screen;
  onNav: (s: Screen) => void;
  alertCount: number;
  dark: boolean;
  onToggleDark: () => void;
  storeName: string;
}) {
  return (
    <nav
      className="flex flex-col h-full"
      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
    >
      {/* Store name */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="text-[10px] font-medium tracking-widest opacity-60 mb-1">STORE</div>
        <div className="text-sm font-bold leading-tight" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
          {storeName}
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => {
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm text-left transition-colors relative ${
                active ? "bg-white/15 font-semibold" : "hover:bg-white/8 font-medium opacity-75 hover:opacity-100"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-white rounded-r" />
              )}
              <span className="text-base w-5 text-center opacity-80">{item.icon}</span>
              <span style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{item.label}</span>
              {item.id === "alerts" && alertCount > 0 && (
                <span className="ml-auto text-xs font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dark mode toggle */}
      <div className="px-5 py-4 border-t border-white/10">
        <button
          onClick={onToggleDark}
          className="w-full flex items-center gap-3 text-sm opacity-75 hover:opacity-100 transition-opacity"
        >
          <span className="text-base">{dark ? "☀" : "☾"}</span>
          <span style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            {dark ? "ライトモード" : "ダークモード"}
          </span>
        </button>
      </div>
    </nav>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({
  menus,
  alerts,
  targetCostRate,
  onNav,
}: {
  menus: MenuItem[];
  alerts: Alert[];
  targetCostRate: number;
  onNav: (s: Screen) => void;
}) {
  const avgCostRate = menus.reduce((s, m) => s + calcCostRate(m), 0) / menus.length;
  const reviewCount = menus.filter((m) => calcCostRate(m) > targetCostRate + 5).length;
  const prevFL = 61.3;
  const currentFL = 63.6;
  const flDiff = currentFL - prevFL;

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
          2026年9月 — ダッシュボード
        </div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          今日の店舗状況
        </h1>
      </div>

      {/* Change highlights — primary focus */}
      <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="px-5 py-3 border-b text-xs font-semibold tracking-widest uppercase" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          前回から変わったこと
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {/* Onion alert */}
          <button
            onClick={() => onNav("alerts")}
            className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[color:var(--muted)]/50 transition-colors group"
          >
            <div className="mt-0.5">
              <StatusDot status="danger" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                たまねぎが大幅に値上がりしています
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                前週比 +45.3%（¥150 → ¥218/kg）　影響メニュー: 豚生姜焼き定食、ハンバーグ定食
              </div>
            </div>
            <div className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }}>
              詳細 →
            </div>
          </button>

          {/* Cabbage alert */}
          <button
            onClick={() => onNav("alerts")}
            className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[color:var(--muted)]/50 transition-colors group"
          >
            <div className="mt-0.5">
              <StatusDot status="warn" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                キャベツが値上がりしています
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                前週比 +37.5%（¥120 → ¥165/kg）　影響メニュー: 唐揚げ定食、野菜炒め定食
              </div>
            </div>
            <div className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }}>
              詳細 →
            </div>
          </button>

          {/* FL ratio change */}
          <button
            onClick={() => onNav("fl")}
            className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[color:var(--muted)]/50 transition-colors group"
          >
            <div className="mt-0.5">
              <StatusDot status="warn" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                FL比率が先月より{fmtPct(flDiff)}悪化しています
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                6月 {fmtPct(prevFL)} → 9月 {fmtPct(currentFL)}　目標値 60.0%を超過
              </div>
            </div>
            <div className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }}>
              詳細 →
            </div>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "登録メニュー数",
            value: `${menus.length}品`,
            sub: "全メニュー",
            status: null,
            onClick: () => onNav("menus"),
          },
          {
            label: "平均原価率",
            value: fmtPct(avgCostRate),
            sub: `目標 ${fmtPct(targetCostRate)}`,
            status: statusColor(avgCostRate, targetCostRate),
            onClick: () => onNav("menus"),
          },
          {
            label: "値上げ検討",
            value: `${reviewCount}品`,
            sub: "原価率超過",
            status: reviewCount > 0 ? "danger" : "ok",
            onClick: () => onNav("menus"),
          },
        ].map((kpi) => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className="rounded border p-4 text-left hover:border-[color:var(--accent)] transition-colors group"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
              {kpi.label}
            </div>
            <div
              className="font-mono text-2xl font-bold leading-none"
              style={{
                color:
                  kpi.status === "danger"
                    ? "var(--status-danger)"
                    : kpi.status === "warn"
                    ? "var(--status-warn)"
                    : kpi.status === "ok"
                    ? "var(--status-ok)"
                    : "var(--foreground)",
              }}
            >
              {kpi.value}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {kpi.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onNav("menus")}
          className="flex items-center gap-3 p-4 rounded border text-left hover:border-[color:var(--accent)] transition-colors"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <span className="text-xl">≡</span>
          <div>
            <div className="text-sm font-semibold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>メニュー一覧・編集</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>売価・原価・食材の管理</div>
          </div>
        </button>
        <button
          onClick={() => onNav("csv")}
          className="flex items-center gap-3 p-4 rounded border text-left hover:border-[color:var(--accent)] transition-colors"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <span className="text-xl">↑</span>
          <div>
            <div className="text-sm font-semibold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>CSV取り込み</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>仕入れデータの一括登録</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Menu List ──────────────────────────────────────────────────────────────
function MenuList({
  menus,
  targetCostRate,
  onEdit,
  onAdd,
}: {
  menus: MenuItem[];
  targetCostRate: number;
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
            メニュー管理
          </div>
          <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
            メニュー一覧
          </h1>
        </div>
        <button
          onClick={onAdd}
          className="px-4 py-2 text-sm font-semibold rounded transition-colors"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          ＋ メニューを追加
        </button>
      </div>

      <div className="rounded border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {/* Table header */}
        <div
          className="grid text-xs font-semibold tracking-wide uppercase px-5 py-3 border-b"
          style={{
            gridTemplateColumns: "1fr 80px 80px 80px 80px 60px",
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
            background: "var(--muted)",
          }}
        >
          <div>メニュー名</div>
          <div className="text-right">売価</div>
          <div className="text-right">原価</div>
          <div className="text-right">原価率</div>
          <div className="text-right">月間販売</div>
          <div className="text-right">状態</div>
        </div>

        {menus.map((menu, i) => {
          const cost = calcCost(menu);
          const rate = calcCostRate(menu);
          const st = statusColor(rate, targetCostRate) as "ok" | "warn" | "danger";
          return (
            <button
              key={menu.id}
              onClick={() => onEdit(menu.id)}
              className="grid w-full px-5 py-4 text-sm text-left hover:bg-[color:var(--muted)]/50 transition-colors border-b last:border-b-0 group"
              style={{
                gridTemplateColumns: "1fr 80px 80px 80px 80px 60px",
                borderColor: "var(--border)",
              }}
            >
              <div className="font-medium group-hover:text-[color:var(--accent)] transition-colors" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
                {menu.name}
              </div>
              <div className="font-mono text-right" style={{ color: "var(--foreground)" }}>
                {fmtYen(menu.price)}
              </div>
              <div className="font-mono text-right" style={{ color: "var(--foreground)" }}>
                {fmtYen(cost)}
              </div>
              <div
                className="font-mono font-semibold text-right"
                style={{
                  color:
                    st === "danger"
                      ? "var(--status-danger)"
                      : st === "warn"
                      ? "var(--status-warn)"
                      : "var(--status-ok)",
                }}
              >
                {fmtPct(rate)}
              </div>
              <div className="font-mono text-right" style={{ color: "var(--muted-foreground)" }}>
                {menu.monthlySales}食
              </div>
              <div className="flex justify-end">
                <StatusBadge
                  status={st}
                  label={st === "ok" ? "正常" : st === "warn" ? "注意" : "要対応"}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
        ※ 目標原価率: {fmtPct(targetCostRate)}　原価率 = 食材原価合計 ÷ 売価 × 100
      </div>
    </div>
  );
}

// ── Menu Edit ──────────────────────────────────────────────────────────────
function MenuEdit({
  menu,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  menu: MenuItem;
  onSave: (m: MenuItem) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState<MenuItem>(JSON.parse(JSON.stringify(menu)));

  const cost = calcCost(draft);
  const rate = (cost / (draft.price || 1)) * 100;

  function updateIngredient(id: string, field: keyof Ingredient, value: string | number) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing) =>
        ing.id === id ? { ...ing, [field]: field === "name" || field === "unit" ? value : Number(value) } : ing
      ),
    }));
  }

  function addIngredient() {
    setDraft((d) => ({
      ...d,
      ingredients: [
        ...d.ingredients,
        { id: `i${Date.now()}`, name: "", cost: 0, unit: "g", amount: 0 },
      ],
    }));
  }

  function removeIngredient(id: string) {
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }));
  }

  const labelStyle = "text-xs font-semibold mb-1 block";
  const inputStyle =
    "w-full px-3 py-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
            メニュー管理
          </div>
          <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
            {isNew ? "メニューを追加" : "メニューを編集"}
          </h1>
        </div>
        <button onClick={onCancel} className="text-sm px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          ← 一覧に戻る
        </button>
      </div>

      {/* Cost rate display */}
      <div className="rounded border p-4 flex items-center gap-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>現在の原価率</div>
          <div
            className="font-mono text-4xl font-bold leading-none mt-1"
            style={{
              color:
                rate > 40 ? "var(--status-danger)" : rate > 35 ? "var(--status-warn)" : "var(--status-ok)",
            }}
          >
            {isNaN(rate) ? "—" : fmtPct(rate)}
          </div>
        </div>
        <div className="h-12 w-px" style={{ background: "var(--border)" }} />
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>食材原価合計</div>
          <div className="font-mono text-2xl font-bold mt-1" style={{ color: "var(--foreground)" }}>
            {fmtYen(cost)}
          </div>
        </div>
      </div>

      {/* Basic info */}
      <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>基本情報</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>メニュー名</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={inputStyle}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
              placeholder="例: 唐揚げ定食"
            />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>売価（税込）</label>
            <input
              type="number"
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
              className={inputStyle + " font-mono"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>月間販売数（食）</label>
            <input
              type="number"
              value={draft.monthlySales}
              onChange={(e) => setDraft((d) => ({ ...d, monthlySales: Number(e.target.value) }))}
              className={inputStyle + " font-mono"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="rounded border p-5 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>食材・原材料</div>
          <button
            onClick={addIngredient}
            className="text-xs font-medium px-3 py-1.5 rounded"
            style={{ background: "var(--secondary)", color: "var(--primary)", fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            ＋ 追加
          </button>
        </div>

        <div className="grid text-xs font-semibold px-2 pb-1" style={{ gridTemplateColumns: "1fr 80px 60px 50px 28px", color: "var(--muted-foreground)" }}>
          <div>食材名</div>
          <div className="text-right">仕入れ単価</div>
          <div className="text-right">使用量</div>
          <div className="text-right">単位</div>
          <div />
        </div>

        <div className="space-y-2">
          {draft.ingredients.map((ing) => (
            <div
              key={ing.id}
              className="grid items-center gap-2 px-2"
              style={{ gridTemplateColumns: "1fr 80px 60px 50px 28px" }}
            >
              <input
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                className={inputStyle}
                style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
                placeholder="食材名"
              />
              <input
                type="number"
                value={ing.cost}
                onChange={(e) => updateIngredient(ing.id, "cost", e.target.value)}
                className={inputStyle + " font-mono text-right"}
                style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <input
                type="number"
                value={ing.amount}
                onChange={(e) => updateIngredient(ing.id, "amount", e.target.value)}
                className={inputStyle + " font-mono text-right"}
                style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <input
                value={ing.unit}
                onChange={(e) => updateIngredient(ing.id, "unit", e.target.value)}
                className={inputStyle + " text-center"}
                style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <button
                onClick={() => removeIngredient(ing.id)}
                className="text-center text-lg leading-none transition-colors hover:text-[color:var(--status-danger)]"
                style={{ color: "var(--muted-foreground)" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="text-xs pt-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
          ※ 原価 = 仕入れ単価（円/kg） × 使用量（g） ÷ 1000
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onSave(draft)}
          className="flex-1 py-3 text-sm font-bold rounded transition-colors"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          保存する
        </button>
        {!isNew && onDelete && (
          <button
            onClick={onDelete}
            className="px-4 py-3 text-sm font-medium rounded border transition-colors hover:bg-red-50"
            style={{ borderColor: "var(--status-danger)", color: "var(--status-danger)", fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}

// ── CSV Wizard ─────────────────────────────────────────────────────────────
function CSVWizard() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({
    メニュー名: "A列",
    売価: "B列",
    食材名: "C列",
    仕入れ単価: "D列",
    使用量: "E列",
  });

  const columns = ["A列", "B列", "C列", "D列", "E列", "F列", "G列"];
  const fields = Object.keys(mapping);

  const steps = ["ファイルを選択", "列の対応を設定", "確認・取り込み"];

  const inputStyle =
    "w-full px-3 py-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-6">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>CSV取り込み</div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          仕入れデータを取り込む
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {steps.map((label, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: i <= step ? "var(--primary)" : "var(--muted)",
                  color: i <= step ? "var(--primary-foreground)" : "var(--muted-foreground)",
                }}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <div className="text-xs text-center whitespace-nowrap" style={{ color: i === step ? "var(--foreground)" : "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px mx-2 mb-4" style={{ background: i < step ? "var(--primary)" : "var(--border)" }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded border p-6 space-y-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>CSV / Excelファイルを選択してください</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>対応形式: .csv, .xlsx, .xls</div>
            </div>
            <label
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded p-10 cursor-pointer hover:border-[color:var(--accent)] transition-colors"
              style={{ borderColor: fileName ? "var(--status-ok)" : "var(--border)" }}
            >
              <span className="text-3xl">{fileName ? "✓" : "↑"}</span>
              <span className="text-sm font-medium" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                {fileName || "クリックしてファイルを選択"}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
              />
            </label>
            <button
              disabled={!fileName}
              onClick={() => setStep(1)}
              className="w-full py-3 text-sm font-bold rounded transition-colors disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              次へ
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>各項目がどの列に入っているか設定してください</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>取り込んだファイル: {fileName}</div>
            </div>
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-medium flex-shrink-0" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                    {field}
                  </div>
                  <select
                    value={mapping[field]}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                    className={inputStyle + " flex-1"}
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(0)} className="px-4 py-2.5 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                戻る
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 text-sm font-bold rounded"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>内容を確認して取り込みを実行してください</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>既存データへの上書きはありません。新規として追加されます。</div>
            </div>
            <div className="rounded border divide-y text-sm" style={{ borderColor: "var(--border)" }}>
              {Object.entries(mapping).map(([field, col]) => (
                <div key={field} className="flex justify-between px-4 py-2.5" style={{ color: "var(--foreground)" }}>
                  <span style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{field}</span>
                  <span className="font-mono font-medium">{col}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-2.5 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                戻る
              </button>
              <button
                onClick={() => { alert("取り込み完了（デモ）"); setStep(0); setFileName(""); }}
                className="flex-1 py-2.5 text-sm font-bold rounded"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
              >
                取り込みを実行する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Revenue Ranking ────────────────────────────────────────────────────────
function Ranking({ menus }: { menus: MenuItem[] }) {
  const ranked = [...menus]
    .map((m) => ({
      ...m,
      profit: (m.price - calcCost(m)) * m.monthlySales,
      profitPerDish: m.price - calcCost(m),
      costRate: calcCostRate(m),
    }))
    .sort((a, b) => b.profit - a.profit);

  const maxProfit = ranked[0]?.profit || 1;

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>収益ランキング</div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          メニュー別 収益貢献度
        </h1>
      </div>
      <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
        収益貢献度 = （売価 − 原価） × 月間販売数
      </div>

      <div className="rounded border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div
          className="grid text-xs font-semibold tracking-wide uppercase px-5 py-3 border-b"
          style={{
            gridTemplateColumns: "32px 1fr 90px 80px 80px 90px",
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
            background: "var(--muted)",
          }}
        >
          <div>#</div>
          <div>メニュー名</div>
          <div className="text-right">月間収益</div>
          <div className="text-right">1食利益</div>
          <div className="text-right">販売数</div>
          <div className="text-right">原価率</div>
        </div>

        {ranked.map((menu, i) => {
          const st = statusColor(menu.costRate, 35) as "ok" | "warn" | "danger";
          return (
            <div
              key={menu.id}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="grid items-center px-5 py-3 text-sm"
                style={{ gridTemplateColumns: "32px 1fr 90px 80px 80px 90px" }}
              >
                <div className="font-mono font-bold text-xs" style={{ color: i === 0 ? "var(--accent)" : "var(--muted-foreground)" }}>
                  {i + 1}
                </div>
                <div className="font-medium" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
                  {menu.name}
                </div>
                <div className="font-mono font-bold text-right" style={{ color: "var(--foreground)" }}>
                  {fmtYen(menu.profit)}
                </div>
                <div className="font-mono text-right" style={{ color: "var(--muted-foreground)" }}>
                  {fmtYen(menu.profitPerDish)}
                </div>
                <div className="font-mono text-right" style={{ color: "var(--muted-foreground)" }}>
                  {menu.monthlySales}食
                </div>
                <div
                  className="font-mono font-semibold text-right"
                  style={{
                    color: st === "danger" ? "var(--status-danger)" : st === "warn" ? "var(--status-warn)" : "var(--status-ok)",
                  }}
                >
                  {fmtPct(menu.costRate)}
                </div>
              </div>
              {/* Bar */}
              <div className="px-5 pb-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(menu.profit / maxProfit) * 100}%`,
                      background: i === 0 ? "var(--accent)" : "var(--primary)",
                      opacity: i === 0 ? 1 : 0.5 + (0.4 * (ranked.length - i - 1)) / ranked.length,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FL Ratio ───────────────────────────────────────────────────────────────
function FLScreen({
  data,
  rent,
  laborCost,
  onUpdateFixed,
}: {
  data: MonthlyFL[];
  rent: number;
  laborCost: number;
  onUpdateFixed: (rent: number, labor: number) => void;
}) {
  const [editRent, setEditRent] = useState(String(rent));
  const [editLabor, setEditLabor] = useState(String(laborCost));
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];

  const flDiff = latest.flRate - prev.flRate;
  const flStatus: "ok" | "warn" | "danger" = latest.flRate <= 60 ? "ok" : latest.flRate <= 65 ? "warn" : "danger";

  const maxFL = Math.max(...data.map((d) => d.flRate));
  const minFL = Math.min(...data.map((d) => d.flRate));
  const range = maxFL - minFL || 1;

  function chartY(val: number, h: number) {
    return h - ((val - minFL + 2) / (range + 4)) * h;
  }

  const W = 480;
  const H = 120;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - 20;
  const points = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * innerW,
    fl: chartY(d.flRate, innerH),
    food: chartY(d.foodCostRate, innerH),
    labor: chartY(d.laborCostRate, innerH),
  }));

  function polyline(pts: { x: number; y: number }[]) {
    return pts.map((p) => `${p.x},${p.y}`).join(" ");
  }

  const inputStyle = "px-3 py-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] font-mono";

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>FL比率</div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          FL比率 = (食材原価 + 人件費) ÷ 売上
        </h1>
      </div>

      {/* Current status */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "食材原価率", value: fmtPct(latest.foodCostRate), diff: latest.foodCostRate - prev.foodCostRate, st: statusColor(latest.foodCostRate, 33) },
          { label: "人件費率", value: fmtPct(latest.laborCostRate), diff: latest.laborCostRate - prev.laborCostRate, st: statusColor(latest.laborCostRate, 30) },
          { label: "FL比率", value: fmtPct(latest.flRate), diff: flDiff, st: flStatus },
          { label: "FLR比率", value: fmtPct(latest.flrRate), diff: latest.flrRate - prev.flrRate, st: statusColor(latest.flrRate, 70) },
        ].map((item) => (
          <div key={item.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>{item.label}</div>
            <div
              className="font-mono text-2xl font-bold leading-none"
              style={{
                color:
                  item.st === "danger"
                    ? "var(--status-danger)"
                    : item.st === "warn"
                    ? "var(--status-warn)"
                    : "var(--status-ok)",
              }}
            >
              {item.value}
            </div>
            <div className="text-xs mt-1 font-mono" style={{ color: item.diff > 0 ? "var(--status-danger)" : "var(--status-ok)" }}>
              {item.diff > 0 ? "▲" : "▼"} {Math.abs(item.diff).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>月次推移（2026年4月〜9月）</div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ minWidth: 320 }}>
            {/* Grid lines */}
            {[60, 65, 70].map((v) => {
              const y = chartY(v, innerH);
              return (
                <g key={v}>
                  <line x1={pad} x2={W - pad} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} className="text-[color:var(--border)]" />
                  <text x={pad - 4} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.4}>{v}</text>
                </g>
              );
            })}
            {/* FL line */}
            <polyline
              points={polyline(points.map((p) => ({ x: p.x, y: p.fl })))}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {/* Food line */}
            <polyline
              points={polyline(points.map((p) => ({ x: p.x, y: p.food })))}
              fill="none"
              stroke="var(--status-ok)"
              strokeWidth={1.5}
              strokeDasharray="4,2"
              strokeLinejoin="round"
            />
            {/* Labor line */}
            <polyline
              points={polyline(points.map((p) => ({ x: p.x, y: p.labor })))}
              fill="none"
              stroke="var(--status-warn)"
              strokeWidth={1.5}
              strokeDasharray="4,2"
              strokeLinejoin="round"
            />
            {/* Points & labels */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.fl} r={3} fill="var(--accent)" />
                <text x={p.x} y={H + 16} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6} style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
                  {data[i].month}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="flex gap-6 mt-2">
          {[
            { label: "FL比率", color: "var(--accent)", dash: false },
            { label: "食材原価率", color: "var(--status-ok)", dash: true },
            { label: "人件費率", color: "var(--status-warn)", dash: true },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <svg width={20} height={2} viewBox="0 0 20 2">
                <line x1={0} y1={1} x2={20} y2={1} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? "4,2" : undefined} />
              </svg>
              <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fixed costs input */}
      <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>固定費の設定</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>家賃（月額・円）</label>
            <input
              type="number"
              value={editRent}
              onChange={(e) => setEditRent(e.target.value)}
              className={inputStyle + " w-full"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>人件費（月額・円）</label>
            <input
              type="number"
              value={editLabor}
              onChange={(e) => setEditLabor(e.target.value)}
              className={inputStyle + " w-full"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
        </div>
        <button
          onClick={() => onUpdateFixed(Number(editRent), Number(editLabor))}
          className="px-5 py-2.5 text-sm font-bold rounded"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          保存する
        </button>
      </div>
    </div>
  );
}

// ── Alerts Screen ──────────────────────────────────────────────────────────
function AlertsScreen({ alerts, menus, targetCostRate }: { alerts: Alert[]; menus: MenuItem[]; targetCostRate: number }) {
  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>仕入れ値アラート</div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          市場価格の変動
        </h1>
      </div>

      <div className="space-y-4">
        {alerts.map((alert) => {
          const st: "warn" | "danger" = alert.changeRate >= 30 ? "danger" : "warn";
          return (
            <div key={alert.id} className="rounded border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div
                className="flex items-center gap-4 px-5 py-4 border-b"
                style={{ borderColor: "var(--border)", borderLeftWidth: 3, borderLeftColor: st === "danger" ? "var(--status-danger)" : "var(--status-warn)" }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
                      {alert.ingredient}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                      {alert.category}
                    </span>
                    <StatusBadge status={st} label={st === "danger" ? "大幅値上がり" : "値上がり"} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{alert.date} 更新</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold" style={{ color: st === "danger" ? "var(--status-danger)" : "var(--status-warn)" }}>
                    +{alert.changeRate.toFixed(1)}%
                  </div>
                  <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {fmtYen(alert.prevPrice)} → {fmtYen(alert.currentPrice)}/kg
                  </div>
                </div>
              </div>
              <div className="px-5 py-3">
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>影響を受けるメニュー</div>
                <div className="space-y-1">
                  {alert.affectedMenus.map((name) => {
                    const menu = menus.find((m) => m.name === name);
                    const rate = menu ? calcCostRate(menu) : null;
                    const st2 = rate ? (statusColor(rate, targetCostRate) as "ok" | "warn" | "danger") : "warn";
                    return (
                      <div key={name} className="flex items-center justify-between text-sm py-1">
                        <span style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>{name}</span>
                        {rate !== null && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>現在の原価率</span>
                            <span className="font-mono font-semibold text-sm" style={{ color: st2 === "danger" ? "var(--status-danger)" : st2 === "warn" ? "var(--status-warn)" : "var(--status-ok)" }}>
                              {fmtPct(rate)}
                            </span>
                            <StatusBadge status={st2} label={st2 === "ok" ? "正常" : st2 === "warn" ? "注意" : "値上げ検討"} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────
function Settings({
  storeName,
  targetCostRate,
  rent,
  laborCost,
  onSave,
}: {
  storeName: string;
  targetCostRate: number;
  rent: number;
  laborCost: number;
  onSave: (s: string, t: number, r: number, l: number) => void;
}) {
  const [s, setS] = useState(storeName);
  const [t, setT] = useState(String(targetCostRate));
  const [r, setR] = useState(String(rent));
  const [l, setL] = useState(String(laborCost));

  const inputStyle = "w-full px-3 py-2.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";
  const labelStyle = "text-xs font-semibold block mb-1";

  return (
    <div className="p-6 md:p-8 max-w-xl space-y-6">
      <div>
        <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>設定</div>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>
          店舗設定
        </h1>
      </div>

      <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>店舗情報</div>
        <div>
          <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>店舗名</label>
          <input
            value={s}
            onChange={(e) => setS(e.target.value)}
            className={inputStyle}
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
          />
        </div>
      </div>

      <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>目標値</div>
        <div>
          <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
            目標原価率（%）
          </label>
          <input
            type="number"
            value={t}
            onChange={(e) => setT(e.target.value)}
            className={inputStyle + " font-mono"}
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
            この値を超えると「注意」「要対応」として表示されます
          </div>
        </div>
      </div>

      <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>固定費（月額）</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>家賃（円）</label>
            <input
              type="number"
              value={r}
              onChange={(e) => setR(e.target.value)}
              className={inputStyle + " font-mono"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>人件費（円）</label>
            <input
              type="number"
              value={l}
              onChange={(e) => setL(e.target.value)}
              className={inputStyle + " font-mono"}
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => onSave(s, Number(t), Number(r), Number(l))}
        className="w-full py-3 text-sm font-bold rounded"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
      >
        保存する
      </button>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────
function Login({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const inputStyle = "w-full px-3 py-3 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";

  return (
    <div className="min-h-full flex" style={{ background: "var(--background)" }}>
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-between w-80 p-10" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
        <div>
          <div className="text-xs font-bold tracking-widest opacity-60 mb-8">GENKA KANRI</div>
          <div className="text-3xl font-bold leading-tight" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            飲食店の<br />原価管理を<br />シンプルに
          </div>
          <div className="text-sm opacity-70 mt-4 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            メニューごとの原価率計算、仕入れ値変動アラート、FL比率の月次管理。毎日使える、信頼できる道具。
          </div>
        </div>
        <div className="text-xs opacity-40">© 2026 Genka Kanri</div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>ログイン</h1>
            <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
              アカウントにサインインしてください
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyle}
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
                placeholder="example@restaurant.jp"
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyle}
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            onClick={onLogin}
            className="w-full py-3 text-sm font-bold rounded"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            ログイン
          </button>

          <div className="text-center text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>
            アカウントをお持ちでない方は{" "}
            <button onClick={onRegister} className="font-semibold underline" style={{ color: "var(--accent)" }}>
              新規登録
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Register ───────────────────────────────────────────────────────────────
function Register({ onRegister, onBack }: { onRegister: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const inputStyle = "w-full px-3 py-3 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";
  const steps = ["店舗情報", "アカウント情報", "完了"];

  return (
    <div className="min-h-full flex items-center justify-center p-8" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← 戻る</button>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>新規登録</h1>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: i <= step ? "var(--primary)" : "var(--muted)",
                  color: i <= step ? "var(--primary-foreground)" : "var(--muted-foreground)",
                }}
              >
                {i < step ? "✓" : i + 1}
              </div>
              {i < steps.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: i < step ? "var(--primary)" : "var(--border)" }} />}
            </div>
          ))}
        </div>

        <div className="rounded border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          {step === 0 && (
            <>
              <div className="text-sm font-semibold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>店舗情報を入力してください</div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>店舗名</label>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className={inputStyle}
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
                  placeholder="例: 食堂やまもと"
                />
              </div>
              <button
                disabled={!storeName.trim()}
                onClick={() => setStep(1)}
                className="w-full py-3 text-sm font-bold rounded disabled:opacity-40"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
              >
                次へ
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="text-sm font-semibold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>アカウント情報を入力してください</div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>メールアドレス</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyle} style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>パスワード</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputStyle} style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-4 py-2.5 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>戻る</button>
                <button
                  disabled={!email || !password}
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 text-sm font-bold rounded disabled:opacity-40"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
                >
                  登録する
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">✓</div>
              <div className="text-base font-bold" style={{ fontFamily: "'Noto Sans JP', sans-serif", color: "var(--foreground)" }}>登録完了</div>
              <div className="text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}>ようこそ、{storeName} さん</div>
              <button
                onClick={onRegister}
                className="w-full py-3 text-sm font-bold rounded"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "'Noto Sans JP', sans-serif" }}
              >
                はじめる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(false);
  const [screen, setScreen] = useState<Screen>("login");
  const [menus, setMenus] = useState<MenuItem[]>(initialMenus);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("食堂やまもと");
  const [targetCostRate, setTargetCostRate] = useState(35);
  const [rent, setRent] = useState(180000);
  const [laborCost, setLaborCost] = useState(620000);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  const isAuthed = screen !== "login" && screen !== "register";

  function handleNav(s: Screen) {
    setEditingId(null);
    setScreen(s);
  }

  function handleEditMenu(id: string) {
    setEditingId(id);
    setScreen("menu-edit");
  }

  function handleAddMenu() {
    const newMenu: MenuItem = {
      id: `m${Date.now()}`,
      name: "",
      price: 0,
      monthlySales: 0,
      ingredients: [],
    };
    setMenus((m) => [...m, newMenu]);
    setEditingId(newMenu.id);
    setScreen("menu-edit");
  }

  function handleSaveMenu(updated: MenuItem) {
    setMenus((m) => m.map((menu) => (menu.id === updated.id ? updated : menu)));
    setScreen("menus");
    setEditingId(null);
  }

  function handleDeleteMenu() {
    if (editingId) {
      setMenus((m) => m.filter((menu) => menu.id !== editingId));
      setScreen("menus");
      setEditingId(null);
    }
  }

  const editingMenu = editingId ? menus.find((m) => m.id === editingId) : null;
  const isNewMenu = editingMenu ? !initialMenus.find((m) => m.id === editingMenu.id) && editingMenu.name === "" : false;

  // Login screens
  if (screen === "login") {
    return (
      <div className="h-full" style={{ background: "var(--background)" }}>
        <Login onLogin={() => setScreen("dashboard")} onRegister={() => setScreen("register")} />
      </div>
    );
  }
  if (screen === "register") {
    return (
      <div className="h-full" style={{ background: "var(--background)" }}>
        <Register onRegister={() => setScreen("dashboard")} onBack={() => setScreen("login")} />
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ background: "var(--background)" }}>
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 h-full overflow-hidden">
        <Sidebar
          current={screen}
          onNav={handleNav}
          alertCount={initialAlerts.length}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          storeName={storeName}
        />
      </div>

      {/* Main */}
      <main className="flex-1 h-full overflow-y-auto" style={{ background: "var(--background)" }}>
        {screen === "dashboard" && (
          <Dashboard menus={menus} alerts={initialAlerts} targetCostRate={targetCostRate} onNav={handleNav} />
        )}
        {screen === "menus" && (
          <MenuList menus={menus} targetCostRate={targetCostRate} onEdit={handleEditMenu} onAdd={handleAddMenu} />
        )}
        {screen === "menu-edit" && editingMenu && (
          <MenuEdit
            menu={editingMenu}
            onSave={handleSaveMenu}
            onCancel={() => { setScreen("menus"); setEditingId(null); }}
            onDelete={handleDeleteMenu}
            isNew={isNewMenu}
          />
        )}
        {screen === "csv" && <CSVWizard />}
        {screen === "ranking" && <Ranking menus={menus} />}
        {screen === "fl" && (
          <FLScreen
            data={monthlyFLData}
            rent={rent}
            laborCost={laborCost}
            onUpdateFixed={(r, l) => { setRent(r); setLaborCost(l); }}
          />
        )}
        {screen === "alerts" && <AlertsScreen alerts={initialAlerts} menus={menus} targetCostRate={targetCostRate} />}
        {screen === "settings" && (
          <Settings
            storeName={storeName}
            targetCostRate={targetCostRate}
            rent={rent}
            laborCost={laborCost}
            onSave={(s, t, r, l) => {
              setStoreName(s);
              setTargetCostRate(t);
              setRent(r);
              setLaborCost(l);
            }}
          />
        )}
      </main>
    </div>
  );
}
