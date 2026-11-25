import { Link } from "react-router-dom";
import { TeamChip } from "../../components/ui/TeamChip";
import { useTeamGames } from "../../data/queries";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

// S07
function Schedule() {
  const { league, userTeam, teamById } = useLeague();
  const games = useTeamGames(league.id, userTeam.id, league.season);
  if (!games) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入賽程中", "Loading schedule")} />;
  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-surface" aria-label={tr("本季賽程", "This season's schedule")}>
      {games.map((g) => {
        const home = g.homeTeamId === userTeam.id;
        const opp = teamById.get(home ? g.awayTeamId : g.homeTeamId)!;
        const done = g.status === "final";
        const mine = home ? g.scoreHome! : g.scoreAway!;
        const theirs = home ? g.scoreAway! : g.scoreHome!;
        const won = done && mine > theirs;
        const isNext = !done && g.day === league.day;
        const row = (
          <>
            <span className="num w-[56px] font-mono text-xs text-text-subtle">{tr(`第 ${g.day + 1} 天`, `Day ${g.day + 1}`)}</span>
            <span className="w-[20px] text-xs text-text-muted">{home ? "vs" : "@"}</span>
            <TeamChip abbrev={opp.abbrev} primary={opp.colors.primary} size={28} />
            <span className="flex-1 min-w-0 truncate">{opp.city} {opp.name}</span>
            {done ? (
              <span className="flex items-center gap-2">
                <span className={cn("w-[16px] font-display font-bold", won ? "text-success" : "text-danger")} aria-label={won ? tr("勝", "Win") : tr("敗", "Loss")}>{won ? "W" : "L"}</span>
                <span className="num w-[72px] text-right font-mono">{mine}–{theirs}</span>
              </span>
            ) : (
              <span className={cn("text-xs", isNext ? "text-accent-text font-semibold" : "text-text-subtle")}>{isNext ? tr("下一場", "Next") : tr("未開打", "Upcoming")}</span>
            )}
          </>
        );
        return (
          <li key={g.id}>
            {done ? (
              <Link to={`/l/${league.id}/game/${g.id}/box`} className="flex items-center gap-3 px-3 h-[48px] text-sm hover:bg-surface-raised">{row}</Link>
            ) : (
              <div className={cn("flex items-center gap-3 px-3 h-[48px] text-sm", isNext && "bg-accent/5")}>{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SchedulePage() {
  return <LeagueShell title={tr("賽程", "Schedule")}><Schedule /></LeagueShell>;
}
