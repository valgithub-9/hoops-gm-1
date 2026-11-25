import { cn } from "../../lib/cn";
import { tr } from "../../i18n";

export const money = (thousands: number) =>
  thousands >= 1000 ? `$${(thousands / 1000).toFixed(1)}M` : `$${thousands}K`;

export function ContractTag({ salary, years, kind, expiring }: {
  salary: number; years: number; kind?: "rookie" | "standard" | "minimum" | "released"; expiring?: boolean;
}) {
  return (
    <span className={cn(
      "num inline-flex items-center gap-1 rounded-sm border px-2 h-[22px] text-xs font-mono",
      expiring ? "border-warning/50 text-warning" : "border-border text-text-muted",
    )}>
      {money(salary)}
      <span className="text-text-subtle">×{years}{tr("年", "y")}</span>
      {kind === "rookie" && <span className="text-info">{tr("新秀約", "rookie")}</span>}
      {kind === "minimum" && <span className="text-text-subtle">{tr("底薪", "min")}</span>}
      {kind === "released" && <span className="text-danger">{tr("已釋出", "released")}</span>}
      {expiring && <span>{tr("到期", "expiring")}</span>}
    </span>
  );
}
