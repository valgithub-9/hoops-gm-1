import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ title, action, children, className }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 h-[48px]">
          <h2 className="font-display text-base uppercase tracking-wide text-text">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-md bg-surface-raised border border-border p-4">
      <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
      <div className={cn("num font-display text-xl mt-1", tone === "success" && "text-success", tone === "danger" && "text-danger")}>{value}</div>
      {sub && <div className="text-xs text-text-subtle mt-1">{sub}</div>}
    </div>
  );
}
