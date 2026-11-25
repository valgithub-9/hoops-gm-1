import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Scoreboard } from "../../components/ui/Scoreboard";
import { useBoxScore, type BoxScore } from "../../data/queries";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

type Line = BoxScore["lines"][number];
const shoot = (m: number, a: number) => `${m}-${a}`;

const columns = (leagueId: string): Column<Line>[] => [
  { key: "name", header: tr("球員", "Player"), sticky: true, cell: (l) => <Link to={`/l/${leagueId}/player/${l.playerId}`} className="font-medium hover:text-accent-text">{l.player.firstName[0]}. {l.player.lastName}</Link> },
  { key: "min", header: tr("分", "Min"), numeric: true, cell: (l) => l.min, sortValue: (l) => l.min },
  { key: "pts", header: tr("得分", "Pts"), numeric: true, cell: (l) => <span className="font-bold text-text">{l.pts}</span>, sortValue: (l) => l.pts },
  { key: "reb", header: tr("籃板", "Reb"), numeric: true, cell: (l) => l.reb, sortValue: (l) => l.reb },
  { key: "ast", header: tr("助攻", "Ast"), numeric: true, cell: (l) => l.ast, sortValue: (l) => l.ast },
  { key: "fg", header: tr("投籃", "FG"), numeric: true, cell: (l) => shoot(l.fgm, l.fga), sortValue: (l) => l.fgm },
  { key: "tp", header: tr("三分", "3P"), numeric: true, cell: (l) => shoot(l.tpm, l.tpa), sortValue: (l) => l.tpm },
  { key: "ft", header: tr("罰球", "FT"), numeric: true, cell: (l) => shoot(l.ftm, l.fta), sortValue: (l) => l.ftm },
  { key: "stl", header: tr("抄截", "Stl"), numeric: true, cell: (l) => l.stl, sortValue: (l) => l.stl },
  { key: "blk", header: tr("火鍋", "Blk"), numeric: true, cell: (l) => l.blk, sortValue: (l) => l.blk },
  { key: "tov", header: tr("失誤", "TO"), numeric: true, cell: (l) => l.tov, sortValue: (l) => l.tov },
  { key: "pf", header: tr("犯規", "PF"), numeric: true, cell: (l) => (l.pf >= 6 ? <span className="text-danger" title={tr("六犯畢業", "Fouled out")}>{l.pf} {tr("犯滿", "FO")}</span> : l.pf), sortValue: (l) => l.pf },
];

// S09
function Box() {
  const { gameId } = useParams();
  const { league, teamById, standings } = useLeague();
  const box = useBoxScore(gameId);
  if (box === undefined) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入中", "Loading")} />;
  if (box === null || box.game.status !== "final") return <p className="text-text-muted">{tr("這場比賽還沒打，或不存在。", "This game has not been played, or does not exist.")}</p>;
  const { game, lines } = box;
  const side = (teamId: string, score: number) => {
    const t = teamById.get(teamId)!;
    const ts = standings.find((s) => s.teamId === teamId);
    return { abbrev: t.abbrev, name: `${t.city} ${t.name}`, primary: t.colors.primary, score, record: ts ? `${ts.wins}–${ts.losses}` : undefined };
  };
  return (
    <div className="space-y-6">
      <Link to={`/l/${league.id}/schedule`} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />{tr("賽程", "Schedule")}</Link>
      {game.playByPlay && <Link to={`/l/${league.id}/game/${game.id}`} className="ml-4 text-sm text-accent-text hover:underline">{tr("逐球紀錄", "Play-by-play")} →</Link>}
      <div className="max-w-[560px]">
        <Scoreboard final period="" away={side(game.awayTeamId, game.scoreAway!)} home={side(game.homeTeamId, game.scoreHome!)} />
        <p className="mt-2 text-xs text-text-subtle">{game.isPlayoff ? tr("季後賽 · ", "Playoffs · ") : ""}{tr(`${league.season} 球季第 ${game.day + 1} 天`, `${league.season} season, day ${game.day + 1}`)}{lines.some((l) => l.min > 48) ? tr(" · 延長賽", " · overtime") : ""}</p>
      </div>
      {lines.length === 0 && <p className="text-sm text-text-muted">{tr("這場比賽的球員數據已封存，只保留最近兩季的 box score。球員的整季數據仍在球員資料頁。", "Player stats for this game were archived; box scores are kept for the last two seasons. Season totals are still on each player's page.")}</p>}
      {lines.length > 0 && [game.awayTeamId, game.homeTeamId].map((tid) => {
        const t = teamById.get(tid)!;
        const rows = lines.filter((l) => l.teamId === tid);
        const tot = rows.reduce((a, l) => ({ fgm: a.fgm + l.fgm, fga: a.fga + l.fga, tpm: a.tpm + l.tpm, tpa: a.tpa + l.tpa, ftm: a.ftm + l.ftm, fta: a.fta + l.fta, reb: a.reb + l.reb, ast: a.ast + l.ast, tov: a.tov + l.tov }), { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, tov: 0 });
        const pctStr = (m: number, a: number) => (a ? `${((m / a) * 100).toFixed(1)}%` : "—");
        return (
          <section key={tid} className="space-y-2" aria-label={tr(`${t.city} ${t.name} 數據`, `${t.city} ${t.name} stats`)}>
            <h2 className="font-display text-lg uppercase tracking-wide">{t.city} {t.name}</h2>
            <DataTable caption={`${t.name} box score`} rows={rows} columns={columns(league.id)} rowKey={(l) => l.id} initialSort={{ key: "min", dir: "desc" }} />
            <p className="num text-xs text-text-muted font-mono">
              {tr("投籃", "FG")} {pctStr(tot.fgm, tot.fga)} · {tr("三分", "3P")} {pctStr(tot.tpm, tot.tpa)} · {tr("罰球", "FT")} {pctStr(tot.ftm, tot.fta)} · {tr("籃板", "Reb")} {tot.reb} · {tr("助攻", "Ast")} {tot.ast} · {tr("失誤", "TO")} {tot.tov}
            </p>
          </section>
        );
      })}
    </div>
  );
}

export function BoxScorePage() {
  return <LeagueShell title="Box Score"><Box /></LeagueShell>;
}
