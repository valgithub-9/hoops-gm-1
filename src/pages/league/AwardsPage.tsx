import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { TeamChip } from "../../components/ui/TeamChip";
import { awardName } from "../../data/awards";
import { useAwards } from "../../data/queries";
import type { Award } from "../../db";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

const ORDER: Award["type"][] = ["CHAMPION", "FINALS_MVP", "MVP", "DPOY", "ROY", "SMOY", "ALL_LEAGUE_1", "ALL_LEAGUE_2"];

// S18
function Awards() {
  const { league, teamById } = useLeague();
  const data = useAwards(league.id);
  if (!data) return <div className="h-[300px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入獎項", "Loading awards")} />;
  const seasons = [...new Set(data.awards.map((a) => a.season))].sort((a, b) => b - a);
  if (seasons.length === 0) return <Card><p className="text-text-muted">{tr("年度獎項在季後賽結束後公布。", "Season awards are announced when the playoffs end.")}</p></Card>;
  const statLine = (playerId: string, season: number) => {
    const s = data.seasonStats.find((x) => x.playerId === playerId && x.season === season && !x.isPlayoff);
    return s && s.gp ? tr(`${(s.pts / s.gp).toFixed(1)} 分 ${(s.reb / s.gp).toFixed(1)} 板 ${(s.ast / s.gp).toFixed(1)} 助`, `${(s.pts / s.gp).toFixed(1)} pts ${(s.reb / s.gp).toFixed(1)} reb ${(s.ast / s.gp).toFixed(1)} ast`) : "";
  };
  return (
    <div className="space-y-8">
      {seasons.map((season) => {
        const list = data.awards.filter((a) => a.season === season);
        return (
          <section key={season} className="space-y-3">
            <h2 className="font-display text-xl uppercase">{tr(`${season} 球季`, `${season} season`)}</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {ORDER.map((type) => {
                const winners = list.filter((a) => a.type === type);
                if (!winners.length) return null;
                return (
                  <Card key={type} title={awardName(type)}>
                    <ul className="space-y-2">
                      {winners.map((a) => {
                        const t = teamById.get(a.teamId);
                        const p = a.playerId ? data.players.get(a.playerId) : null;
                        return (
                          <li key={a.id} className="flex items-center gap-2 min-w-0">
                            {t && <TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={24} />}
                            <div className="min-w-0">
                              {p ? <Link to={`/l/${league.id}/player/${p.id}`} className="font-medium hover:text-accent-text">{p.firstName} {p.lastName}</Link>
                                : <span className="font-medium">{t ? `${t.city} ${t.name}` : "—"}</span>}
                              {p && <div className="num text-xs text-text-muted font-mono">{statLine(p.id, season)}</div>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function AwardsPage() {
  return <LeagueShell title={tr("年度獎項", "Awards")}><Awards /></LeagueShell>;
}
