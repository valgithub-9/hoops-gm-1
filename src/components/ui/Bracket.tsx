import { cn } from "../../lib/cn";

export type Series = { id: string; a: string; b: string; winsA: number; winsB: number };

// Rounds left to right; scrolls horizontally on phones.
export function Bracket({ rounds }: { rounds: { name: string; series: Series[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 min-w-max">
        {rounds.map((r) => (
          <div key={r.name} className="flex flex-col justify-around gap-3 w-[168px]">
            <div className="text-xs uppercase tracking-wider text-text-muted">{r.name}</div>
            {r.series.map((s) => {
              const done = s.winsA === 4 || s.winsB === 4;
              const line = (t: string, w: number, won: boolean) => (
                <div className={cn("flex justify-between px-3 h-[32px] items-center", done && !won && "text-text-subtle")}>
                  <span className="font-display">{t}</span>
                  <span className={cn("num font-mono", won ? "text-scoreboard font-bold" : "")}>{w}</span>
                </div>
              );
              return (
                <div key={s.id} className="rounded-md border border-border bg-surface divide-y divide-border text-sm">
                  {line(s.a, s.winsA, s.winsA === 4)}
                  {line(s.b, s.winsB, s.winsB === 4)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
