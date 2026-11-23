import { Trophy } from "lucide-react";
import { Bracket } from "../../components/ui/Bracket";
import { Card } from "../../components/ui/Card";
import { TeamChip } from "../../components/ui/TeamChip";
import { champion, roundName, type Series } from "../../data/playoffs";
import { useBracket } from "../../data/queries";
import { CONFERENCE_NAMES } from "../../lib/standings";
import { LeagueShell, useLeague } from "./LeagueShell";

// S17
function Playoffs() {
  const { league, teamById, userTeam } = useLeague();
  const rounds = useBracket(league);
  if (league.phase === "regular") {
    return <Card><p className="text-text-muted">季後賽在例行賽結束後開打。每區前 {league.settings.playoffTeams / 2} 名晉級，系列賽先拿 4 勝的晉級。</p></Card>;
  }
  if (!rounds) return <div className="h-[300px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入對戰樹" />;
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
            <div className="text-xs uppercase tracking-wider text-text-muted">{league.season} 總冠軍</div>
            <div className="font-display text-xl uppercase text-scoreboard">{champTeam.city} {champTeam.name}</div>
          </div>
        </div>
      )}
      {([0, 1] as const).map((c) => (
        <section key={c} className="space-y-3">
          <h2 className="font-display text-lg uppercase tracking-wide">{CONFERENCE_NAMES[c]}</h2>
          <Bracket rounds={confRounds.map((r) => ({
            name: roundName(r[0].round, league.settings.playoffTeams),
            series: r.filter((s) => s.conference === c).map(view),
          }))} />
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="font-display text-lg uppercase tracking-wide">總冠軍賽</h2>
        <Bracket rounds={[{ name: "總冠軍賽", series: [view(finals)] }]} />
      </section>
      <p className="text-xs text-text-subtle">數字是種子序。高種子在第 1、2、5、7 戰有主場；總冠軍賽主場給例行賽勝率較高的球隊。你的球隊用橘色框標示。</p>
    </div>
  );
}

export function PlayoffsPage() {
  return <LeagueShell title="季後賽"><Playoffs /></LeagueShell>;
}
