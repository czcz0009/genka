"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "./SignOutButton.tsx";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconList({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconUpload({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconTrendingUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconActivity({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconAlertTriangle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: IconGrid },
  { href: "/menus", label: "原価計算", icon: IconList },
  { href: "/import", label: "CSV取り込み", icon: IconUpload },
  { href: "/ranking", label: "収益ランキング", icon: IconTrendingUp },
  { href: "/fl-ratio", label: "FL比率", icon: IconActivity },
  { href: "/alerts", label: "仕入れ値アラート", icon: IconAlertTriangle },
  { href: "/settings", label: "設定", icon: IconSettings },
];

/**
 * ナビリンクのprefetchについて(重要な経緯):
 *
 * Next.jsのLinkの自動prefetch(prefetch={true}相当)は、サイドバーのように
 * 常時表示されているリンクがビューポートに入った瞬間、7個すべてを同時に
 * バックグラウンド取得しようとする。実機検証したところ、この「複数リクエストが
 * ほぼ同時にSupabaseの認証セッションを読みに行く」状況で、セッションの
 * トークン更新が競合し、ナビゲーション中に強制ログアウトされる不具合を
 * 実際に再現した(過去の「優先度3」でprefetchを無効化した理由もこれと同じ)。
 *
 * この競合は「同時に投げるリクエストの本数」を減らせば実質的に避けられる
 * (トークン更新はCookieに書き込まれた古いトークンを複数リクエストが同時に
 * 使い回そうとした時だけ起きる)。そこで、常時全リンクを自動prefetchするのではなく
 * 「マウスが実際にホバーしたリンク1つだけ」を、かつ共有の1つのタイマーで
 * 遅延実行することで、同時に走るprefetchリクエストが実質的に1本を超えない
 * ようにしている(タイマーが1つしかないため、複数リンクに素早くカーソルを
 * 動かしても直前のタイマーはキャンセルされ、常に最後にホバーしたリンクの分だけが
 * 予約される)。サーバー側でのロック等による修正は、Cookieがリクエストごとの
 * スナップショットである以上原理的に効果がないため採用していない。
 */
function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const router = useRouter();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter(href: string) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      router.prefetch(href);
    }, 150);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto py-3">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onMouseEnter={() => handleMouseEnter(item.href)}
            onMouseLeave={handleMouseLeave}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
              active ? "bg-white/15 font-semibold" : "font-medium opacity-75 hover:bg-white/8 hover:opacity-100"
            }`}
          >
            {active && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-white" />}
            <Icon className="size-[18px] shrink-0 opacity-80" />
            <span style={{ fontFamily: "var(--font-noto-sans-jp)" }}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * design-reference(Figma Make案)のサイドバーをベースに、既存アプリが
 * 対応していたスマホ幅への対応を追加している(参考実装は固定幅のデスクトップ
 * 専用レイアウトだったため)。md以上は常時表示の固定サイドバー、それ未満は
 * 上部の細いバー+ハンバーガーメニューで開閉するドロワーにしている。
 */
export function Sidebar({ storeName }: { storeName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* モバイル用の上部バー */}
      <div
        className="flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="メニューを開く"
          className="-ml-1 flex size-9 items-center justify-center rounded"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-sm font-bold" style={{ fontFamily: "var(--font-noto-sans-jp)" }}>
          {storeName}
        </span>
      </div>

      {/* モバイル用ドロワー */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="メニューを閉じる"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <nav
            className="absolute left-0 top-0 flex h-full w-64 flex-col"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <SidebarHeader storeName={storeName} />
            <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter />
          </nav>
        </div>
      )}

      {/* デスクトップ用の固定サイドバー */}
      <nav
        className="hidden h-full w-52 flex-shrink-0 flex-col md:flex"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        <SidebarHeader storeName={storeName} />
        <NavList pathname={pathname} />
        <SidebarFooter />
      </nav>
    </>
  );
}

function SidebarHeader({ storeName }: { storeName: string }) {
  return (
    <div className="border-b border-white/10 px-5 pb-5 pt-6">
      <div className="mb-1 text-[10px] font-medium tracking-widest opacity-60">STORE</div>
      <div className="text-sm font-bold leading-tight" style={{ fontFamily: "var(--font-noto-sans-jp)" }}>
        {storeName}
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-white/10 px-5 py-4">
      <SignOutButton className="flex w-full items-center gap-3 text-sm font-medium opacity-75 transition-opacity hover:opacity-100" />
    </div>
  );
}
