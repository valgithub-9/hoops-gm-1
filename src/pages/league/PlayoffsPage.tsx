import { Trophy } from "lucide-react";
import { Bracket } from "../../components/ui/Bracket";
import { Card } from "../../components/ui/Card";
import { TeamChip } from "../../components/ui/TeamChip";
import { champion, roundName, type Series } from "../../data/playoffs";
import { useBracket } from "../../data/queries";
import { conferenceName } from "../../lib/standings";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

// S17
function Playoffs() {
  const { league, teamById, userTeam } = useLeague();
  const rounds = useBracket(league);
  if (league.phase === "regular") {
    return <Card><p className="text-text-muted">{tr(`季後賽在例行賽結束後開打。每區前 ${league.settings.playoffTeams / 2} 名晉級，系列賽先拿 4 勝的晉級。`, `The playoffs start after the regular season. The top ${league.settings.playoffTeams / 2} in each conference qualify; the first to 4 wins takes a series.`)}</p></Card>;
  }
  if (!rounds) return <div className="h-[300px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入對戰樹", "Loading bracket")} />;
  const abbrev = (id: string | null) => (id ? teamById.get(id)?.abbrev ?? "?" : "—");
  const view = (s: Series) => ({
    id: s.id, a: abbrev(s.top), b: abbrev(s.bottom), winsA: s.winsTop, winsB: s.winsBottom, seedA: s.topSeed, seedB: s.bottomSeed,
    highlight: s.top === userTeam.id || s.bottom === userTeam.id,
  });
  const champ = champion(rounds);
  const champTeam = champ ? teamById.get(champ) : null;
  const confRounds = rounds.slice(0, -1);
  const finals = rounds[rounds.length - 1][0];

  return (
    <div className="space-y-8">
      {champTeam && (
        <div className="flex items-center gap-4 rounded-lg border border-scoreboard/40 bg-scoreboard-bg p-5 shadow-glow">
          <Trophy className="size-8 text-scoreboard" aria-hidden />
          <TeamChip abbrev={champTeam.abbrev} primary={champTeam.colors.primary} size={48} />
          <div>
            <div className="text-xs uppercase tracking-wider text-text-muted">{tr(`${league.season} 總冠軍`, `${league.season} champions`)}</div>
            <div className="font-display text-xl uppercase text-scoreboard">{champTeam.city} {champTeam.name}</div>
          </div>
        </div>
      )}
      {([0, 1] as const).map((c) => (
        <section key={c} className="space-y-3">
          <h2 className="font-display text-lg uppercase tracking-wide">{conferenceName(c)}</h2>
          <Bracket rounds={confRounds.map((r) => ({
            name: roundName(r[0].round, league.settings.playoffTeams),
            series: r.filter((s) => s.conference === c).map(view),
          }))} />
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase tracking-wide">{tr("總冠軍賽", "Finals")}</h2>
        <Bracket rounds={[{ name: tr("總冠軍賽", "Finals"), series: [view(finals)] }]} />
      </section>
      <p className="text-xs text-text-subtle">{tr("數字是種子序。高種子在第 1、2、5、7 戰有主場；總冠軍賽主場給例行賽勝率較高的球隊。你的球隊用橘色框標示。", "Numbers are seeds. The higher seed is at home in games 1, 2, 5 and 7; in the Finals, the better regular-season record has home court. Your team has an orange outline.")}</p>
    </div>
  );
}

export function PlayoffsPage() {
  return <LeagueShell title={tr("季後賽", "Playoffs")}><Playoffs /></LeagueShell>;
}
