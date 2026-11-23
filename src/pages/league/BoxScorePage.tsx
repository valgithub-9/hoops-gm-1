import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Scoreboard } from "../../components/ui/Scoreboard";
import { useBoxScore, type BoxScore } from "../../data/queries";
import { LeagueShell, useLeague } from "./LeagueShell";

type Line = BoxScore["lines"][number];
const shoot = (m: number, a: number) => `${m}-${a}`;

const columns = (leagueId: string): Column<Line>[] => [
  { key: "name", header: "球員", sticky: true, cell: (l) => <Link to={`/l/${leagueId}/player/${l.playerId}`} className="font-medium hover:text-accent-text">{l.player.firstName[0]}. {l.player.lastName}</Link> },
  { key: "min", header: "分", numeric: true, cell: (l) => l.min, sortValue: (l) => l.min },
  { key: "pts", header: "得分", numeric: true, cell: (l) => <span className="font-bold text-text">{l.pts}</span>, sortValue: (l) => l.pts },
  { key: "reb", header: "籃板", numeric: true, cell: (l) => l.reb, sortValue: (l) => l.reb },
  { key: "ast", header: "助攻", numeric: true, cell: (l) => l.ast, sortValue: (l) => l.ast },
  { key: "fg", header: "投籃", numeric: true, cell: (l) => shoot(l.fgm, l.fga), sortValue: (l) => l.fgm },
  { key: "tp", header: "三分", numeric: true, cell: (l) => shoot(l.tpm, l.tpa), sortValue: (l) => l.tpm },
  { key: "ft", header: "罰球", numeric: true, cell: (l) => shoot(l.ftm, l.fta), sortValue: (l) => l.ftm },
  { key: "stl", header: "抄截", numeric: true, cell: (l) => l.stl, sortValue: (l) => l.stl },
  { key: "blk", header: "火鍋", numeric: true, cell: (l) => l.blk, sortValue: (l) => l.blk },
  { key: "tov", header: "失誤", numeric: true, cell: (l) => l.tov, sortValue: (l) => l.tov },
  { key: "pf", header: "犯規", numeric: true, cell: (l) => (l.pf >= 6 ? <span className="text-danger" title="六犯畢業">{l.pf} 犯滿</span> : l.pf), sortValue: (l) => l.pf },
];

// S09
function Box() {
  const { gameId } = useParams();
  const { league, teamById, standings } = useLeague();
  const box = useBoxScore(gameId);
  if (box === undefined) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入中" />;
  if (box === null || box.game.status !== "final") return <p className="text-text-muted">這場比賽還沒打，或不存在。</p>;
  const { game, lines } = box;
  const side = (teamId: string, score: number) => {
    const t = teamById.get(teamId)!;
    const ts = standings.find((s) => s.teamId === teamId);
    return { abbrev: t.abbrev, name: `${t.city} ${t.name}`, primary: t.colors.primary, score, record: ts ? `${ts.wins}–${ts.losses}` : undefined };
  };
  return (
    <div className="space-y-6">
      <Link to={`/l/${league.id}/schedule`} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />賽程</Link>
      <div className="max-w-[560px]">
        <Scoreboard final period="" away={side(game.awayTeamId, game.scoreAway!)} home={side(game.homeTeamId, game.scoreHome!)} />
        <p className="mt-2 text-xs text-text-subtle">{game.isPlayoff ? "季後賽 · " : ""}{league.season} 球季第 {game.day + 1} 天{lines.some((l) => l.min > 48) ? " · 延長賽" : ""}</p>
      </div>
      {lines.length === 0 && <p className="text-sm text-text-muted">這場比賽的球員數據已封存，只保留最近兩季的 box score。球員的整季數據仍在球員資料頁。</p>}
      {lines.length > 0 && [game.awayTeamId, game.homeTeamId].map((tid) => {
        const t = teamById.get(tid)!;
        const rows = lines.filter((l) => l.teamId === tid);
        const tot = rows.reduce((a, l) => ({ fgm: a.fgm + l.fgm, fga: a.fga + l.fga, tpm: a.tpm + l.tpm, tpa: a.tpa + l.tpa, ftm: a.ftm + l.ftm, fta: a.fta + l.fta, reb: a.reb + l.reb, ast: a.ast + l.ast, tov: a.tov + l.tov }), { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, tov: 0 });
        const pctStr = (m: number, a: number) => (a ? `${((m / a) * 100).toFixed(1)}%` : "—");
        return (
          <section key={tid} className="space-y-2" aria-label={`${t.city} ${t.name} 數據`}>
            <h2 className="font-display text-lg uppercase tracking-wide">{t.city} {t.name}</h2>
            <DataTable caption={`${t.name} box score`} rows={rows} columns={columns(league.id)} rowKey={(l) => l.id} initialSort={{ key: "min", dir: "desc" }} />
            <p className="num text-xs text-text-muted font-mono">
              投籃 {pctStr(tot.fgm, tot.fga)} · 三分 {pctStr(tot.tpm, tot.tpa)} · 罰球 {pctStr(tot.ftm, tot.fta)} · 籃板 {tot.reb} · 助攻 {tot.ast} · 失誤 {tot.tov}
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
