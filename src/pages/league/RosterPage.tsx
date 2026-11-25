import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { ContractTag } from "../../components/ui/ContractTag";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Ovr } from "../../components/ui/RatingBar";
import { useRoster, type RosterRow } from "../../data/queries";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

const f1 = (n: number) => n.toFixed(1);

// S04
function Roster() {
  const { league, userTeam } = useLeague();
  const rows = useRoster(league.id, userTeam, league.season);
  const age = (r: RosterRow) => league.season - r.player.bornYear;
  const cols: Column<RosterRow>[] = [
    { key: "name", header: tr("球員", "Player"), sticky: true, sortValue: (r) => r.player.lastName,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Link to={`/l/${league.id}/player/${r.player.id}`} className="font-medium max-w-[180px] truncate hover:text-accent-text">{r.player.firstName} {r.player.lastName}</Link>
          {r.starter && <Badge tone="accent">{tr("先發", "Starter")}</Badge>}
          {r.player.injury && <Badge tone="danger">{r.player.injury.type} · {tr(`缺 ${r.player.injury.gamesRemaining} 場`, `out ${r.player.injury.gamesRemaining}`)}</Badge>}
        </span>
      ) },
    { key: "pos", header: tr("位置", "Pos"), cell: (r) => r.player.position, sortValue: (r) => "PG SG SF PF C".indexOf(r.player.position) },
    { key: "age", header: tr("年齡", "Age"), numeric: true, cell: age, sortValue: age },
    { key: "ovr", header: tr("總評", "Ovr"), numeric: true, cell: (r) => <Ovr value={r.player.overall} size="sm" />, sortValue: (r) => r.player.overall },
    { key: "min", header: tr("分鐘", "Min"), numeric: true, cell: (r) => r.minutes, sortValue: (r) => r.minutes },
    { key: "gp", header: tr("出賽", "GP"), numeric: true, cell: (r) => r.gp, sortValue: (r) => r.gp },
    { key: "pts", header: tr("得分", "Pts"), numeric: true, cell: (r) => f1(r.pts), sortValue: (r) => r.pts },
    { key: "reb", header: tr("籃板", "Reb"), numeric: true, cell: (r) => f1(r.reb), sortValue: (r) => r.reb },
    { key: "ast", header: tr("助攻", "Ast"), numeric: true, cell: (r) => f1(r.ast), sortValue: (r) => r.ast },
    { key: "contract", header: tr("合約", "Contract"), cell: (r) => (
      <ContractTag salary={r.salary} years={r.contractEnd - league.season + 1} expiring={r.contractEnd === league.season} />
    ), sortValue: (r) => r.salary },
  ];
  if (!rows) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入名單中", "Loading roster")} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{tr(`${rows.length} 人 · 數據為本季例行賽場均`, `${rows.length} players · stats are regular-season averages`)} · <Link to={`/l/${league.id}/rotation`} className="text-accent-text hover:underline">{tr("調整輪替", "Edit rotation")}</Link></p>
      <DataTable caption={tr(`${userTeam.city} ${userTeam.name} 名單`, `${userTeam.city} ${userTeam.name} roster`)} rows={rows} columns={cols} rowKey={(r) => r.player.id}
        initialSort={{ key: "min", dir: "desc" }} empty={tr("名單是空的。", "The roster is empty.")} />
      <Card><p className="text-xs text-text-subtle">{tr("點球員名字看各項能力、生涯數據和球探估計的潛力區間。", "Select a name to see ratings, career stats and the scouted potential range.")}</p></Card>
    </div>
  );
}

export function RosterPage() {
  return <LeagueShell title={tr("名單", "Roster")}><Roster /></LeagueShell>;
}
