import { DataTable, type Column } from "../../components/ui/DataTable";
import { TeamChip } from "../../components/ui/TeamChip";
import { useAwards } from "../../data/queries";
import type { TeamSeason } from "../../db";
import { LeagueShell, useLeague } from "./LeagueShell";

const RESULT: Record<NonNullable<TeamSeason["playoffResult"]>, string> = { champion: "🏆 總冠軍", finals: "總冠軍賽", round: "季後賽", missed: "未進季後賽" };

// S19
function History() {
  const { league, teamById, userTeam } = useLeague();
  const data = useAwards(league.id);
  if (!data) return <div className="h-[300px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入歷史" />;
  const champs = data.awards.filter((a) => a.type === "CHAMPION").sort((a, b) => b.season - a.season);
  const mine = data.teamSeasons.filter((t) => t.teamId === userTeam.id).sort((a, b) => b.season - a.season);
  const titles = new Map<string, number>();
  for (const c of champs) titles.set(c.teamId, (titles.get(c.teamId) ?? 0) + 1);
  const cols: Column<TeamSeason>[] = [
    { key: "season", header: "球季", cell: (s) => s.season },
    { key: "record", header: "戰績", numeric: true, cell: (s) => `${s.wins}–${s.losses}` },
    { key: "pct", header: "勝率", numeric: true, cell: (s) => (s.wins + s.losses ? (s.wins / (s.wins + s.losses)).toFixed(3).replace(/^0/, "") : "—") },
    { key: "result", header: "季後賽", cell: (s) => (s.playoffResult ? RESULT[s.playoffResult] : "進行中") },
  ];
  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase">歷屆總冠軍</h2>
        {champs.length === 0 ? <p className="text-text-muted">還沒有總冠軍。打完第一個季後賽就會出現在這裡。</p> : (
          <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
            {champs.map((c) => {
              const t = teamById.get(c.teamId)!;
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 h-[48px]">
                  <span className="num font-mono text-sm text-scoreboard">{c.season}</span>
                  <TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={28} />
                  <span className={t.id === userTeam.id ? "text-accent-text font-semibold" : ""}>{t.city} {t.name}</span>
                  <span className="ml-auto text-xs text-text-muted">第 {titles.get(t.id)} 冠</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase">{userTeam.city} {userTeam.name} 歷年戰績</h2>
        <DataTable caption="我的球隊歷年戰績" rows={mine} columns={cols} rowKey={(s) => s.id} />
      </section>
    </div>
  );
}

export function HistoryPage() {
  return <LeagueShell title="歷史"><History /></LeagueShell>;
}
