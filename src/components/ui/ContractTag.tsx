import { cn } from "../../lib/cn";

export const money = (thousands: number) =>
  thousands >= 1000 ? `$${(thousands / 1000).toFixed(1)}M` : `$${thousands}K`;

export function ContractTag({ salary, years, kind, expiring }: {
  salary: number; years: number; kind?: "rookie" | "standard" | "minimum"; expiring?: boolean;
}) {
  return (
    <span className={cn(
      "num inline-flex items-center gap-1 rounded-sm border px-2 h-[22px] text-xs font-mono",
      expiring ? "border-warning/50 text-warning" : "border-border text-text-muted",
    )}>
      {money(salary)}
      <span className="text-text-subtle">×{years}年</span>
      {kind === "rookie" && <span className="text-info">新秀約</span>}
      {kind === "minimum" && <span className="text-text-subtle">底薪</span>}
      {expiring && <span>到期</span>}
    </span>
  );
}
