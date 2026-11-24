import { LangToggle } from "./LangToggle";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { tr } from "../../i18n";

export interface NavItem { to: string; label: string; icon: LucideIcon }

// Desktop: fixed sidebar with every item. Phone: header + bottom nav with the first five.
export function AppShell({ title, subtitle, actions, nav, homeTo = "/", children }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; nav: NavItem[]; homeTo?: string; children: ReactNode;
}) {
  const { pathname, hash } = useLocation();
  const here = pathname + hash;
  const isActive = (to: string) => (to.includes("#") ? here === to : pathname === to || pathname.startsWith(to + "/"));
  const link = (n: NavItem, mobile: boolean) => {
    const active = isActive(n.to);
    return (
      <Link key={n.to} to={n.to} aria-current={active ? "page" : undefined}
        className={mobile
          ? cn("flex flex-col items-center justify-center gap-1 text-xs", active ? "text-accent-text" : "text-text-muted")
          : cn("flex items-center gap-3 rounded-md px-3 h-[40px] text-sm",
              active ? "bg-accent/15 text-accent-text font-semibold" : "text-text-muted hover:bg-surface-raised hover:text-text")}>
        <n.icon className={mobile ? "size-5" : "size-4"} aria-hidden />{n.label}
      </Link>
    );
  };
  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-sidebar flex-col border-r border-border bg-surface">
        <Link to={homeTo} className="h-header flex items-center gap-2 px-4 border-b border-border">
          <span className="size-[24px] rounded-full bg-accent shadow-glow" aria-hidden />
          <span className="font-display text-lg uppercase tracking-wider">Hoops GM</span>
        </Link>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label={tr("主要導覽", "Main navigation")}>{nav.map((n) => link(n, false))}</nav>
      </aside>

      <header className="sticky top-0 z-30 h-header flex items-center justify-between gap-3 border-b border-border bg-bg/90 backdrop-blur px-4">
        <div className="min-w-0">
          <h1 className="font-display text-lg uppercase tracking-wide truncate leading-tight">{title}</h1>
          {subtitle && <div className="text-xs text-text-muted truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <LangToggle />
          {actions}
        </div>
      </header>

      <main className="mx-auto max-w-content px-4 py-6 pb-[96px] lg:pb-6">{children}</main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-bottom-nav grid grid-cols-5 border-t border-border bg-surface" aria-label={tr("主要導覽", "Main navigation")}>
        {nav.slice(0, 5).map((n) => link(n, true))}
      </nav>
    </div>
  );
}
