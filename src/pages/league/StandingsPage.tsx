import { DataTable, type Column } from "../../components/ui/DataTable";
import { TeamChip } from "../../components/ui/TeamChip";
import { CONFERENCE_NAMES, conferenceStandings, fmtPct, type StandingRow } from "../../lib/standings";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

// S10
function Standings() {
  const { league, teams, standings, userTeam } = useLeague();
  const cut = league.settings.playoffTeams / 2;
  const gp = (r: StandingRow) => r.ts.wins + r.ts.losses;
  const cols: Column<StandingRow>[] = [
    { key: "rank", header: "#", numeric: true, cell: (r) => <span className={cn(r.rank <= cut && "text-accent-text font-bold")}>{r.rank}</span> },
    { key: "team", header: "球隊", sticky: true, cell: (r) => (
      <span className={cn("flex items-center gap-2", r.team.id === userTeam.id && "text-accent-text font-semibold")}>
        <TeamChip abbrev={r.team.abbrev} primary={r.team.colors.primary} size={24} />
        <span className="max-w-[200px] truncate">{r.team.city} {r.team.name}</span>
        {r.team.id === userTeam.id && <span className="sr-only">（你的球隊）</span>}
      </span>
    ) },
    { key: "w", header: "勝", numeric: true, cell: (r) => r.ts.wins },
    { key: "l", header: "敗", numeric: true, cell: (r) => r.ts.losses },
    { key: "pct", header: "勝率", numeric: true, cell: (r) => fmtPct(r.pct) },
    { key: "gb", header: "勝差", numeric: true, cell: (r) => (r.gb === 0 ? "—" : r.gb.toFixed(1)) },
    { key: "pf", header: "得分", numeric: true, cell: (r) => (gp(r) ? (r.ts.pointsFor / gp(r)).toFixed(1) : "—") },
    { key: "pa", header: "失分", numeric: true, cell: (r) => (gp(r) ? (r.ts.pointsAgainst / gp(r)).toFixed(1) : "—") },
    { key: "diff", header: "分差", numeric: true, cell: (r) => {
      if (!gp(r)) return "—";
      const d = (r.ts.pointsFor - r.ts.pointsAgainst) / gp(r);
      return <span className={d > 0 ? "text-success" : d < 0 ? "text-danger" : ""}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>;
    } },
  ];
  return (
    <div className="space-y-8">
      <p className="text-sm text-text-muted">每區前 {cut} 名（橘色排名）進入季後賽。</p>
      {([0, 1] as const).map((c) => (
        <section key={c} className="space-y-2">
          <h2 className="font-display text-lg uppercase tracking-wide">{CONFERENCE_NAMES[c]}</h2>
          <DataTable caption={`${CONFERENCE_NAMES[c]}排名`} rows={conferenceStandings(teams, standings, c)} columns={cols} rowKey={(r) => r.team.id} />
        </section>
      ))}
    </div>
  );
}

export function StandingsPage() {
  return <LeagueShell title="排名"><Standings /></LeagueShell>;
}
