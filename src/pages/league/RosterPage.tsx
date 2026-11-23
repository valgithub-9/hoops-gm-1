import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { ContractTag } from "../../components/ui/ContractTag";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Ovr } from "../../components/ui/RatingBar";
import { useRoster, type RosterRow } from "../../data/queries";
import { LeagueShell, useLeague } from "./LeagueShell";

const f1 = (n: number) => n.toFixed(1);

// S04
function Roster() {
  const { league, userTeam } = useLeague();
  const rows = useRoster(league.id, userTeam, league.season);
  const age = (r: RosterRow) => league.season - r.player.bornYear;
  const cols: Column<RosterRow>[] = [
    { key: "name", header: "球員", sticky: true, sortValue: (r) => r.player.lastName,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium max-w-[180px] truncate">{r.player.firstName} {r.player.lastName}</span>
          {r.starter && <Badge tone="accent">先發</Badge>}
        </span>
      ) },
    { key: "pos", header: "位置", cell: (r) => r.player.position, sortValue: (r) => "PG SG SF PF C".indexOf(r.player.position) },
    { key: "age", header: "年齡", numeric: true, cell: age, sortValue: age },
    { key: "ovr", header: "總評", numeric: true, cell: (r) => <Ovr value={r.player.overall} size="sm" />, sortValue: (r) => r.player.overall },
    { key: "min", header: "分鐘", numeric: true, cell: (r) => r.minutes, sortValue: (r) => r.minutes },
    { key: "gp", header: "出賽", numeric: true, cell: (r) => r.gp, sortValue: (r) => r.gp },
    { key: "pts", header: "得分", numeric: true, cell: (r) => f1(r.pts), sortValue: (r) => r.pts },
    { key: "reb", header: "籃板", numeric: true, cell: (r) => f1(r.reb), sortValue: (r) => r.reb },
    { key: "ast", header: "助攻", numeric: true, cell: (r) => f1(r.ast), sortValue: (r) => r.ast },
    { key: "contract", header: "合約", cell: (r) => (
      <ContractTag salary={r.salary} years={r.contractEnd - league.season + 1} expiring={r.contractEnd === league.season} />
    ), sortValue: (r) => r.salary },
  ];
  if (!rows) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入名單中" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{rows.length} 人 · 輪替由系統依總評自動安排，手動調整會在之後的版本加入。</p>
      <DataTable caption={`${userTeam.city} ${userTeam.name} 名單`} rows={rows} columns={cols} rowKey={(r) => r.player.id}
        initialSort={{ key: "min", dir: "desc" }} empty="名單是空的。" />
      <Card><p className="text-xs text-text-subtle">總評會在球員資料頁拆成各項能力；潛力只會顯示球探估計的區間。</p></Card>
    </div>
  );
}

export function RosterPage() {
  return <LeagueShell title="名單"><Roster /></LeagueShell>;
}
