import { DataTable, type Column } from "../../components/ui/DataTable";
import { TeamChip } from "../../components/ui/TeamChip";
import { conferenceName, conferenceStandings, fmtPct, type StandingRow } from "../../lib/standings";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

// S10
function Standings() {
  const { league, teams, standings, userTeam } = useLeague();
  const cut = league.settings.playoffTeams / 2;
  const gp = (r: StandingRow) => r.ts.wins + r.ts.losses;
  const cols: Column<StandingRow>[] = [
    { key: "rank", header: "#", numeric: true, cell: (r) => <span className={cn(r.rank <= cut && "text-accent-text font-bold")}>{r.rank}</span> },
    { key: "team", header: tr("球隊", "Team"), sticky: true, cell: (r) => (
      <span className={cn("flex items-center gap-2", r.team.id === userTeam.id && "text-accent-text font-semibold")}>
        <TeamChip abbrev={r.team.abbrev} primary={r.team.colors.primary} size={24} />
        <span className="max-w-[200px] truncate">{r.team.city} {r.team.name}</span>
        {r.team.id === userTeam.id && <span className="sr-only">{tr("（你的球隊）", " (your team)")}</span>}
      </span>
    ) },
    { key: "w", header: tr("勝", "W"), numeric: true, cell: (r) => r.ts.wins },
    { key: "l", header: tr("敗", "L"), numeric: true, cell: (r) => r.ts.losses },
    { key: "pct", header: tr("勝率", "Pct"), numeric: true, cell: (r) => fmtPct(r.pct) },
    { key: "gb", header: tr("勝差", "GB"), numeric: true, cell: (r) => (r.gb === 0 ? "—" : r.gb.toFixed(1)) },
    { key: "pf", header: tr("得分", "PF"), numeric: true, cell: (r) => (gp(r) ? (r.ts.pointsFor / gp(r)).toFixed(1) : "—") },
    { key: "pa", header: tr("失分", "PA"), numeric: true, cell: (r) => (gp(r) ? (r.ts.pointsAgainst / gp(r)).toFixed(1) : "—") },
    { key: "diff", header: tr("分差", "Diff"), numeric: true, cell: (r) => {
      if (!gp(r)) return "—";
      const d = (r.ts.pointsFor - r.ts.pointsAgainst) / gp(r);
      return <span className={d > 0 ? "text-success" : d < 0 ? "text-danger" : ""}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>;
    } },
  ];
  return (
    <div className="space-y-8">
      <p className="text-sm text-text-muted">{tr(`每區前 ${cut} 名（橘色排名）進入季後賽。`, `The top ${cut} in each conference (orange rank) make the playoffs.`)}</p>
      {([0, 1] as const).map((c) => (
        <section key={c} className="space-y-2">
          <h2 className="font-display text-lg uppercase tracking-wide">{conferenceName(c)}</h2>
          <DataTable caption={tr(`${conferenceName(c)}排名`, `${conferenceName(c)} standings`)} rows={conferenceStandings(teams, standings, c)} columns={cols} rowKey={(r) => r.team.id} />
        </section>
      ))}
    </div>
  );
}

export function StandingsPage() {
  return <LeagueShell title={tr("排名", "Standings")}><Standings /></LeagueShell>;
}
