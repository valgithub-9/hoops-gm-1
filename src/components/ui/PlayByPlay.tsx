import { cn } from "../../lib/cn";

export type Play = { id: string; clock: string; team: string; text: string; score: string; scoring?: boolean };

export function PlayByPlay({ plays, live }: { plays: Play[]; live?: boolean }) {
  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-surface" aria-live={live ? "polite" : undefined} aria-label="逐球紀錄">
      {plays.map((p) => (
        <li key={p.id} className="grid grid-cols-[52px_44px_1fr_64px] items-center gap-2 px-3 h-[40px] text-sm">
          <span className="num font-mono text-xs text-text-subtle">{p.clock}</span>
          <span className="font-display text-xs text-text-muted">{p.team}</span>
          <span className={cn("truncate", p.scoring ? "text-text font-medium" : "text-text-muted")}>{p.text}</span>
          <span className={cn("num text-right font-mono text-xs", p.scoring ? "text-scoreboard" : "text-text-subtle")}>{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
