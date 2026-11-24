import { DataTable, type Column } from "../../components/ui/DataTable";
import { TeamChip } from "../../components/ui/TeamChip";
import { useAwards } from "../../data/queries";
import type { TeamSeason } from "../../db";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

const result = (r: NonNullable<TeamSeason["playoffResult"]>) => ({ champion: tr("🏆 總冠軍", "🏆 Champion"), finals: tr("總冠軍賽", "Lost in the Finals"), round: tr("季後賽", "Playoffs"), missed: tr("未進季後賽", "Missed playoffs") })[r];

// S19
function History() {
  const { league, teamById, userTeam } = useLeague();
  const data = useAwards(league.id);
  if (!data) return <div className="h-[300px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入歷史", "Loading history")} />;
  const champs = data.awards.filter((a) => a.type === "CHAMPION").sort((a, b) => b.season - a.season);
  const mine = data.teamSeasons.filter((t) => t.teamId === userTeam.id).sort((a, b) => b.season - a.season);
  const titles = new Map<string, number>();
  for (const c of champs) titles.set(c.teamId, (titles.get(c.teamId) ?? 0) + 1);
  const cols: Column<TeamSeason>[] = [
    { key: "season", header: tr("球季", "Season"), cell: (s) => s.season },
    { key: "record", header: tr("戰績", "Record"), numeric: true, cell: (s) => `${s.wins}–${s.losses}` },
    { key: "pct", header: tr("勝率", "Pct"), numeric: true, cell: (s) => (s.wins + s.losses ? (s.wins / (s.wins + s.losses)).toFixed(3).replace(/^0/, "") : "—") },
    { key: "result", header: tr("季後賽", "Playoffs"), cell: (s) => (s.playoffResult ? result(s.playoffResult) : tr("進行中", "In progress")) },
  ];
  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase">{tr("歷屆總冠軍", "Champions")}</h2>
        {champs.length === 0 ? <p className="text-text-muted">{tr("還沒有總冠軍。打完第一個季後賽就會出現在這裡。", "No champions yet. The first one appears here after the first playoffs.")}</p> : (
          <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
            {champs.map((c) => {
              const t = teamById.get(c.teamId)!;
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 h-[48px]">
                  <span className="num font-mono text-sm text-scoreboard">{c.season}</span>
                  <TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={28} />
                  <span className={t.id === userTeam.id ? "text-accent-text font-semibold" : ""}>{t.city} {t.name}</span>
                  <span className="ml-auto text-xs text-text-muted">{tr(`第 ${titles.get(t.id)} 冠`, `title #${titles.get(t.id)}`)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase">{tr(`${userTeam.city} ${userTeam.name} 歷年戰績`, `${userTeam.city} ${userTeam.name} by season`)}</h2>
        <DataTable caption={tr("我的球隊歷年戰績", "My team by season")} rows={mine} columns={cols} rowKey={(s) => s.id} />
      </section>
    </div>
  );
}

export function HistoryPage() {
  return <LeagueShell title={tr("歷史", "History")}><History /></LeagueShell>;
}
