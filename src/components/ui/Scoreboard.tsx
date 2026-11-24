import { TeamChip } from "./TeamChip";
import { cn } from "../../lib/cn";
import { tr } from "../../i18n";

type Side = { abbrev: string; name: string; primary: string; score: number; record?: string };

// The signature piece of the visual system: an LED-style board.
export function Scoreboard({ home, away, period, clock, final, compact }: {
  home: Side; away: Side; period: string; clock?: string; final?: boolean; compact?: boolean;
}) {
  const lead = home.score === away.score ? null : home.score > away.score ? "home" : "away";
  const row = (s: Side, side: "home" | "away") => (
    <div className="flex items-center gap-3 min-w-0">
      <TeamChip abbrev={s.abbrev} primary={s.primary} size={compact ? 28 : 40} />
      <div className="min-w-0">
        <div className={cn("font-display uppercase truncate", compact ? "text-sm" : "text-lg")}>{s.name}</div>
        {s.record && !compact && <div className="num text-xs text-text-muted">{s.record}</div>}
      </div>
      <div
        className={cn(
          "num ml-auto font-mono font-bold text-scoreboard",
          compact ? "text-lg" : "text-score",
          final && lead !== side && "opacity-50",
        )}
        style={compact ? undefined : { textShadow: "0 0 18px rgb(var(--color-scoreboard) / .45)" }}
      >
        {s.score}
      </div>
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-scoreboard-bg p-4 shadow-card" role="group" aria-label={`${away.name} ${away.score}, ${home.name} ${home.score}, ${final ? tr("終場", "final") : period}`}>
      <div className="flex flex-col gap-3">
        {row(away, "away")}
        {row(home, "home")}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs uppercase tracking-wider">
        <span className={cn("font-mono font-bold", final ? "text-text-muted" : "text-accent-text")}>{final ? tr("終場 FINAL", "FINAL") : period}</span>
        {clock && !final && <span className="num font-mono text-scoreboard">{clock}</span>}
      </div>
    </div>
  );
}
