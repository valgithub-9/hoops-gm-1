import { useLocation } from "react-router-dom";
import { LayoutDashboard, Users, CalendarDays, ArrowLeftRight, Trophy, Settings, Palette } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const nav = [
  { to: "/design", label: "球隊", icon: LayoutDashboard },
  { to: "/design#roster", label: "名單", icon: Users },
  { to: "/design#schedule", label: "賽程", icon: CalendarDays },
  { to: "/design#trade", label: "交易", icon: ArrowLeftRight },
  { to: "/design#playoffs", label: "季後賽", icon: Trophy },
];

// Desktop: fixed sidebar. Phone: header + bottom nav (5 items max).
export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { pathname, hash } = useLocation();
  const here = pathname + hash;
  const isActive = (to: string, i: number) => here === to || (i === 0 && !nav.some((n) => n.to === here));
  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-sidebar flex-col border-r border-border bg-surface">
        <div className="h-header flex items-center gap-2 px-4 border-b border-border">
          <span className="size-[24px] rounded-full bg-accent shadow-glow" aria-hidden />
          <span className="font-display text-lg uppercase tracking-wider">Hoops GM</span>
        </div>
        <nav className="flex-1 p-2 space-y-1" aria-label="主要導覽">
          {[...nav, { to: "/design#settings", label: "設定", icon: Settings }].map((n, i) => (
            <a key={n.to} href={n.to} aria-current={isActive(n.to, i) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-md px-3 h-[40px] text-sm",
                isActive(n.to, i) ? "bg-accent/15 text-accent-text font-semibold" : "text-text-muted hover:bg-surface-raised hover:text-text")}>
              <n.icon className="size-4" aria-hidden />{n.label}
            </a>
          ))}
        </nav>
        <div className="p-4 text-xs text-text-subtle flex items-center gap-2"><Palette className="size-3" aria-hidden />設計系統預覽</div>
      </aside>

      <header className="sticky top-0 z-30 h-header flex items-center justify-between gap-3 border-b border-border bg-bg/90 backdrop-blur px-4">
        <h1 className="font-display text-lg uppercase tracking-wide truncate">{title}</h1>
        {actions}
      </header>

      <main className="mx-auto max-w-content px-4 py-6 pb-[96px] lg:pb-6">{children}</main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-bottom-nav grid grid-cols-5 border-t border-border bg-surface" aria-label="主要導覽">
        {nav.map((n, i) => (
          <a key={n.to} href={n.to} aria-current={isActive(n.to, i) ? "page" : undefined}
            className={cn("flex flex-col items-center justify-center gap-1 text-xs", isActive(n.to, i) ? "text-accent-text" : "text-text-muted")}>
            <n.icon className="size-5" aria-hidden />{n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
