import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-raised text-text-muted border-border",
  accent: "bg-accent/15 text-accent-text border-accent/40",
  success: "bg-success/10 text-success border-success/40",
  danger: "bg-danger/10 text-danger border-danger/40",
  warning: "bg-warning/10 text-warning border-warning/40",
  info: "bg-info/10 text-info border-info/40",
};

export function Badge({ tone = "neutral", icon, children, className }: {
  tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 h-[22px] text-xs font-medium", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
