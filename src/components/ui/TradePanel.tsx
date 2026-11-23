import { ArrowLeftRight } from "lucide-react";
import { money } from "./ContractTag";
import { Badge } from "./Badge";
import { cn } from "../../lib/cn";

type Asset = { id: string; label: string; salary?: number };
type Side = { team: string; assets: Asset[] };

// F04. Salary totals and the verdict are always visible; problems are listed in words.
export function TradePanel({ a, b, problems = [], verdict }: {
  a: Side; b: Side; problems?: string[]; verdict?: { decision: "accept" | "reject" | "counter"; reason: string };
}) {
  const total = (s: Side) => s.assets.reduce((n, x) => n + (x.salary ?? 0), 0);
  const col = (s: Side, label: string) => (
    <div className="flex-1 min-w-0 rounded-md border border-border bg-surface-raised p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display uppercase">{s.team}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {s.assets.map((x) => (
          <li key={x.id} className="flex justify-between gap-2 text-sm">
            <span className="truncate">{x.label}</span>
            {x.salary != null && <span className="num font-mono text-text-muted">{money(x.salary)}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-border pt-2 flex justify-between text-xs">
        <span className="text-text-muted">薪資合計</span>
        <span className="num font-mono">{money(total(s))}</span>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        {col(a, "送出")}
        <ArrowLeftRight className="size-5 self-center text-text-subtle shrink-0" aria-hidden />
        {col(b, "得到")}
      </div>
      {problems.length > 0 && (
        <ul className="space-y-1" aria-label="交易問題">
          {problems.map((p) => <li key={p}><Badge tone="warning">{p}</Badge></li>)}
        </ul>
      )}
      {verdict && (
        <div className={cn("rounded-md border p-3 text-sm",
          verdict.decision === "accept" ? "border-success/40 text-success" : verdict.decision === "reject" ? "border-danger/40 text-danger" : "border-info/40 text-info")}
          role="status">
          <span className="font-semibold">{verdict.decision === "accept" ? "對方接受" : verdict.decision === "reject" ? "對方拒絕" : "對方還價"}：</span>
          <span className="text-text-muted">{verdict.reason}</span>
        </div>
      )}
    </div>
  );
}
