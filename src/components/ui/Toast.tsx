import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const icon = {
  success: <CheckCircle2 className="size-5 text-success" aria-hidden />,
  warning: <AlertTriangle className="size-5 text-warning" aria-hidden />,
  error: <XCircle className="size-5 text-danger" aria-hidden />,
};

// Static presentational toast; the queue lives in app state later.
export function Toast({ tone, title, children }: { tone: keyof typeof icon; title: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border bg-surface-raised p-3 shadow-pop w-full max-w-[360px]",
        tone === "success" && "border-success/40", tone === "warning" && "border-warning/40", tone === "error" && "border-danger/40")}>
      {icon[tone]}
      <div>
        <div className="text-sm font-semibold text-text">{title}</div>
        {children && <div className="text-xs text-text-muted mt-1">{children}</div>}
      </div>
    </div>
  );
}
