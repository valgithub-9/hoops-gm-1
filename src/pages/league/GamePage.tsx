import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Scoreboard } from "../../components/ui/Scoreboard";
import { TeamChip } from "../../components/ui/TeamChip";
import { useGame } from "../../data/queries";
import type { PlayEvent, Player } from "../../db";
import { tr } from "../../i18n";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

const periodName = (q: number) => (q <= 4 ? tr(`第 ${q} 節`, `Q${q}`) : tr(`延長 ${q - 4}`, `OT${q - 4}`));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** One play as a sentence, in the current language. */
function sentence(e: PlayEvent, name: (id?: string | null) => string): string {
  const a = name(e.playerId), b = name(e.otherId);
  switch (e.kind) {
    case "make": {
      const what = e.shot === "three" ? tr("三分球命中", "makes a three") : e.shot === "rim" ? tr("上籃得分", "scores at the rim") : tr("跳投命中", "hits a jumper");
      return `${a} ${what}` + (e.otherId ? tr(`，${b} 助攻`, ` (assist: ${b})`) : "");
    }
    case "miss": {
      const what = e.shot === "three" ? tr("三分出手不進", "misses a three") : e.shot === "rim" ? tr("上籃不進", "misses at the rim") : tr("跳投不進", "misses a jumper");
      return `${a} ${what}` + (e.otherId ? tr(`，被 ${b} 封阻`, ` (blocked by ${b})`) : "");
    }
    case "ft": return `${a} ${e.made ? tr("罰球命中", "makes a free throw") : tr("罰球不進", "misses a free throw")}`;
    case "tov": return `${a} ${tr("失誤", "turns it over")}` + (e.otherId ? tr(`，被 ${b} 抄截`, ` (stolen by ${b})`) : "");
    case "reb": return `${a} ${e.offensive ? tr("進攻籃板", "offensive rebound") : tr("防守籃板", "defensive rebound")}`;
    case "foul": return `${a} ${e.shooting ? tr("投籃犯規", "shooting foul") : tr("犯規", "personal foul")}`;
    case "foulout": return `${a} ${tr("六犯畢業", "fouls out")}`;
    case "injury": return `${a} ${tr("受傷退場", "is hurt and leaves the game")}`;
  }
}

const scores = (e: PlayEvent) => e.kind === "make" || (e.kind === "ft" && !!e.made);
const notable = (e: PlayEvent) => e.kind === "foulout" || e.kind === "injury";

// S08
function GameView() {
  const { gameId } = useParams();
  const { league, teamById, standings, userTeam } = useLeague();
  const data = useGame(gameId);
  const [period, setPeriod] = useState<number | "all">(1);
  const [onlyScoring, setOnlyScoring] = useState(false);
  if (data === undefined) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入比賽", "Loading game")} />;
  if (data === null || data.game.status !== "final") return <p className="text-text-muted">{tr("這場比賽還沒打，或不存在。", "This game has not been played, or does not exist.")}</p>;
  const { game, players } = data;
  const home = teamById.get(game.homeTeamId)!, away = teamById.get(game.awayTeamId)!;
  const side = (id: string, score: number) => {
    const t = teamById.get(id)!;
    const ts = standings.find((s) => s.teamId === id);
    return { abbrev: t.abbrev, name: `${t.city} ${t.name}`, primary: t.colors.primary, score, record: ts ? `${ts.wins}–${ts.losses}` : undefined };
  };
  const plays = game.playByPlay;
  const name = (id?: string | null) => {
    const p: Player | undefined = id ? players.get(id) : undefined;
    return p ? `${p.firstName[0]}. ${p.lastName}` : "—";
  };

  // Line score: each team's points in each period, from the running score at the end of it.
  const periods = plays ? [...new Set(plays.map((e) => e.q))] : [];
  const endOf = (q: number) => { const inQ = plays!.filter((e) => e.q <= q); return inQ[inQ.length - 1] ?? { scoreHome: 0, scoreAway: 0 }; };
  const line = periods.map((q, i) => {
    const end = endOf(q), start = i ? endOf(periods[i - 1]) : { scoreHome: 0, scoreAway: 0 };
    return { q, home: end.scoreHome - start.scoreHome, away: end.scoreAway - start.scoreAway };
  });
  const shown = (plays ?? []).filter((e) => (period === "all" || e.q === period) && (!onlyScoring || scores(e) || notable(e)));

  return (
    <div className="space-y-6">
      <Link to={`/l/${league.id}/game/${game.id}/box`} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />{tr("Box score", "Box score")}
      </Link>
      <div className="grid lg:grid-cols-[minmax(0,560px)_1fr] gap-6 items-start">
        <Scoreboard final period="" away={side(game.awayTeamId, game.scoreAway!)} home={side(game.homeTeamId, game.scoreHome!)} />
        {plays && (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{tr("各節得分", "Score by period")}</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                  <th scope="col" className="h-[36px] px-3 text-left">{tr("球隊", "Team")}</th>
                  {line.map((l) => <th key={l.q} scope="col" className="px-3 text-right">{l.q <= 4 ? l.q : `OT${l.q - 4}`}</th>)}
                  <th scope="col" className="px-3 text-right">{tr("總分", "T")}</th>
                </tr>
              </thead>
              <tbody>
                {[{ t: away, k: "away" as const, total: game.scoreAway! }, { t: home, k: "home" as const, total: game.scoreHome! }].map(({ t, k, total }) => (
                  <tr key={k} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 h-[40px] text-left font-normal">
                      <span className="flex items-center gap-2"><TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={22} />{t.abbrev}</span>
                    </th>
                    {line.map((l) => <td key={l.q} className="num px-3 text-right font-mono">{l[k]}</td>)}
                    <td className="num px-3 text-right font-mono font-bold text-scoreboard">{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!plays ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
          {[game.homeTeamId, game.awayTeamId].includes(userTeam.id)
            ? tr("這場比賽的逐球紀錄已封存，只保留最近兩季。", "The play-by-play for this game was archived; it is kept for the last two seasons.")
            : tr("只有你的球隊的比賽會記錄逐球紀錄。", "Play-by-play is recorded for your team's games only.")}
        </p>
      ) : (
        <section className="space-y-3" aria-label={tr("逐球紀錄", "Play-by-play")}>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label={tr("選擇節數", "Choose period")} className="flex flex-wrap gap-1">
              {[...periods, "all" as const].map((q) => (
                <button key={q} type="button" role="tab" aria-selected={period === q} onClick={() => setPeriod(q)}
                  className={cn("rounded-md px-3 h-[32px] text-sm", period === q ? "bg-accent text-on-accent font-semibold" : "bg-surface-raised text-text-muted hover:text-text")}>
                  {q === "all" ? tr("全場", "All") : periodName(q)}
                </button>
              ))}
            </div>
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-text-muted">
              <input type="checkbox" className="size-4 accent-[rgb(var(--color-accent))]" checked={onlyScoring} onChange={(e) => setOnlyScoring(e.target.checked)} />
              {tr("只看得分", "Scoring plays only")}
            </label>
          </div>
          <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-text-muted">{tr("這一節沒有符合的紀錄。", "No plays match in this period.")}</li>}
            {shown.map((e, i) => {
              const t = teamById.get(e.teamId)!;
              const big = scores(e);
              return (
                <li key={i} className={cn("grid grid-cols-[48px_40px_minmax(0,1fr)_64px] items-center gap-2 px-3 min-h-[40px] py-1 text-sm", notable(e) && "bg-danger/5")}>
                  <span className="num font-mono text-xs text-text-subtle">{period === "all" ? `${e.q <= 4 ? `Q${e.q}` : `OT${e.q - 4}`} ` : ""}{clock(e.clock)}</span>
                  <span className="font-display text-xs text-text-muted">{t.abbrev}</span>
                  <span className={cn("min-w-0", big ? "text-text font-medium" : notable(e) ? "text-danger" : "text-text-muted")}>{sentence(e, name)}</span>
                  <span className={cn("num text-right font-mono text-xs", big ? "text-scoreboard" : "text-text-subtle")}>{e.scoreAway}–{e.scoreHome}</span>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-text-subtle">{tr(`比分順序：${away.abbrev}–${home.abbrev}（客隊在前）。`, `Score shown as ${away.abbrev}–${home.abbrev} (away first).`)}</p>
        </section>
      )}
    </div>
  );
}

export function GamePage() {
  return <LeagueShell title={tr("比賽", "Game")}><GameView /></LeagueShell>;
}
