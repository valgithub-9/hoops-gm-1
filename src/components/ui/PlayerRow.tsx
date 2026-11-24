import { HeartCrack } from "lucide-react";
import { Ovr } from "./RatingBar";
import { ContractTag } from "./ContractTag";
import { Badge } from "./Badge";
import { tr } from "../../i18n";

export type PlayerSummary = {
  id: string; name: string; pos: string; age: number; ovr: number;
  salary: number; years: number; injuredGames?: number; expiring?: boolean;
};

export function PlayerRow({ p, compact }: { p: PlayerSummary; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md px-3 h-[52px] hover:bg-surface-raised">
      <Ovr value={p.ovr} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text">{p.name}</div>
        <div className="text-xs text-text-muted">{p.pos} · {tr(`${p.age} 歲`, `age ${p.age}`)}</div>
      </div>
      {p.injuredGames ? <Badge tone="danger" icon={<HeartCrack className="size-3" aria-hidden />}>{tr(`傷 ${p.injuredGames} 場`, `out ${p.injuredGames}`)}</Badge> : null}
      {!compact && <ContractTag salary={p.salary} years={p.years} expiring={p.expiring} />}
    </div>
  );
}
