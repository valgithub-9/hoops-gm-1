import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, Stat } from "../../components/ui/Card";
import { ContractTag } from "../../components/ui/ContractTag";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Ovr, RatingBar } from "../../components/ui/RatingBar";
import { TeamChip } from "../../components/ui/TeamChip";
import { awardName } from "../../data/awards";
import { scoutedPotential } from "../../data/draft";
import { usePlayer } from "../../data/queries";
import { ACTIVE, type PlayerGameStat, type PlayerSeasonStat } from "../../db";
import { RATING_KEYS, ratingLabel } from "../../engine/players";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

type SeasonRow = { key: string; season: number; playoffs: boolean; teamAbbrev: string; gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number; fg: string; tp: string; ft: string };
const pctStr = (m: number, a: number) => (a ? ((m / a) * 100).toFixed(1) : "—");

function seasons(lines: PlayerGameStat[], abbrev: (teamId: string) => string): SeasonRow[] {
  const map = new Map<string, PlayerGameStat[]>();
  for (const l of lines) {
    const k = `${l.season}|${l.isPlayoff}|${l.teamId}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(l);
  }
  return [...map.entries()].map(([key, ls]) => {
    const sum = (k: keyof PlayerGameStat) => ls.reduce((n, l) => n + (l[k] as number), 0);
    const avg = (k: keyof PlayerGameStat) => sum(k) / ls.length;
    return {
      key, season: ls[0].season, playoffs: !!ls[0].isPlayoff, teamAbbrev: abbrev(ls[0].teamId), gp: ls.length,
      min: avg("min"), pts: avg("pts"), reb: avg("reb"), ast: avg("ast"), stl: avg("stl"), blk: avg("blk"),
      fg: pctStr(sum("fgm"), sum("fga")), tp: pctStr(sum("tpm"), sum("tpa")), ft: pctStr(sum("ftm"), sum("fta")),
    };
  }).sort((a, b) => b.season - a.season || Number(a.playoffs) - Number(b.playoffs));
}

/** Seasons whose box scores were archived: rebuilt from the stored season totals. */
function archived(totals: PlayerSeasonStat[], have: Set<string>, abbrev: (teamId: string) => string): SeasonRow[] {
  return totals.filter((t) => !have.has(`${t.season}|${t.isPlayoff}|${t.teamId}`) && t.gp > 0).map((t) => ({
    key: `${t.season}|${t.isPlayoff}|${t.teamId}`, season: t.season, playoffs: !!t.isPlayoff, teamAbbrev: abbrev(t.teamId), gp: t.gp,
    min: t.min / t.gp, pts: t.pts / t.gp, reb: t.reb / t.gp, ast: t.ast / t.gp, stl: t.stl / t.gp, blk: t.blk / t.gp,
    fg: pctStr(t.fgm, t.fga), tp: pctStr(t.tpm, t.tpa), ft: pctStr(t.ftm, t.fta),
  }));
}

const f1 = (n: number) => n.toFixed(1);
const cols = (): Column<SeasonRow>[] => [
  { key: "season", header: tr("球季", "Season"), sticky: true, cell: (r) => <span>{r.season}{r.playoffs && <Badge tone="accent" className="ml-2">{tr("季後賽", "Playoffs")}</Badge>}</span> },
  { key: "team", header: tr("球隊", "Team"), cell: (r) => r.teamAbbrev },
  { key: "gp", header: tr("出賽", "GP"), numeric: true, cell: (r) => r.gp },
  { key: "min", header: tr("分鐘", "Min"), numeric: true, cell: (r) => f1(r.min) },
  { key: "pts", header: tr("得分", "Pts"), numeric: true, cell: (r) => <span className="font-bold text-text">{f1(r.pts)}</span> },
  { key: "reb", header: tr("籃板", "Reb"), numeric: true, cell: (r) => f1(r.reb) },
  { key: "ast", header: tr("助攻", "Ast"), numeric: true, cell: (r) => f1(r.ast) },
  { key: "stl", header: tr("抄截", "Stl"), numeric: true, cell: (r) => f1(r.stl) },
  { key: "blk", header: tr("火鍋", "Blk"), numeric: true, cell: (r) => f1(r.blk) },
  { key: "fg", header: "FG%", numeric: true, cell: (r) => r.fg },
  { key: "tp", header: "3P%", numeric: true, cell: (r) => r.tp },
  { key: "ft", header: "FT%", numeric: true, cell: (r) => r.ft },
];

// S05
function PlayerView() {
  const { playerId } = useParams();
  const { league, teamById } = useLeague();
  const data = usePlayer(playerId);
  if (data === undefined) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入球員資料", "Loading player")} />;
  if (data === null) return <p className="text-text-muted">{tr("找不到這位球員。", "Player not found.")}</p>;
  const { player: p, lines, contracts, history, awards, team, seasonTotals } = data;
  const age = league.season - p.bornYear;
  const contract = contracts.filter((c) => c.endSeason >= league.season).sort((a, b) => b.endSeason - a.endSeason)[0];
  const scout = scoutedPotential(p);
  const prev = history.sort((a, b) => b.season - a.season)[0];
  const abbrev = (id: string) => teamById.get(id)?.abbrev ?? "—";
  const live = seasons(lines, abbrev);
  const rows = [...live, ...archived(seasonTotals, new Set(live.map((r) => r.key)), abbrev)]
    .sort((a, b) => b.season - a.season || Number(a.playoffs) - Number(b.playoffs));
  const status = p.retiredSeason !== ACTIVE ? tr(`${p.retiredSeason} 年退休`, `Retired ${p.retiredSeason}`) : p.isProspect ? tr("選秀新秀", "Draft prospect") : team ? `${team.city} ${team.name}` : tr("自由球員", "Free agent");

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />{tr("返回", "Back")}
      </button>
      <div className="flex flex-wrap items-center gap-4">
        <Ovr value={p.overall} size="lg" />
        <div className="min-w-0">
          <h2 className="font-display text-xl uppercase break-words">{p.firstName} {p.lastName}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            {team && <TeamChip abbrev={team.abbrev} primary={team.colors.primary} size={20} />}
            <span>{status}</span><span>· {p.position}</span><span>· {tr(`${age} 歲`, `age ${age}`)}</span><span>· {p.heightCm} cm</span>
            {p.injury && <Badge tone="danger">{p.injury.type} · {tr(`還要缺席 ${p.injury.gamesRemaining} 場`, `out ${p.injury.gamesRemaining} more games`)}</Badge>}
            {p.draft && <span>· {tr(`${p.draft.season} 選秀第 ${p.draft.pick} 順位`, `${p.draft.season} draft, pick ${p.draft.pick}`)}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={tr("總評", "Overall")} value={p.overall} sub={prev ? tr(`去年 ${prev.overall}（${p.overall - prev.overall >= 0 ? "+" : ""}${p.overall - prev.overall}）`, `Last year ${prev.overall} (${p.overall - prev.overall >= 0 ? "+" : ""}${p.overall - prev.overall})`) : tr("第一個球季", "First season")} />
        <Stat label={tr("潛力（球探估計）", "Potential (scouted)")} value={age >= 27 ? tr("已定型", "Settled") : `${scout[0]}–${scout[1]}`} sub={age >= 27 ? tr("27 歲後不再成長", "No more growth after 27") : tr("實際潛力不會顯示", "True potential stays hidden")} />
        <Stat label={tr("合約", "Contract")} value={contract ? <ContractTag salary={contract.salaryPerYear} years={contract.endSeason - league.season + 1} kind={contract.type} expiring={contract.endSeason === league.season} /> : tr("無", "None")}
          sub={contract ? tr(`到 ${contract.endSeason} 年`, `Through ${contract.endSeason}`) : undefined} />
        <Stat label={tr("獎項", "Awards")} value={awards.length} sub={awards.slice(0, 2).map((a) => `${a.season} ${awardName(a.type)}`).join(tr("、", ", ")) || "—"} />
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        <Card title={tr("能力值", "Ratings")}>
          <div className="space-y-3">
            {RATING_KEYS.map((k) => (
              <RatingBar key={k} label={ratingLabel(k)} value={p.ratings[k]} delta={prev ? p.ratings[k] - prev.ratings[k] : undefined} />
            ))}
          </div>
        </Card>
        <div className="space-y-3 min-w-0">
          <h3 className="font-display text-lg uppercase">{tr("生涯數據（場均）", "Career stats (per game)")}</h3>
          <DataTable caption={tr("生涯數據", "Career stats")} rows={rows} columns={cols()} rowKey={(r) => r.key} empty={tr("還沒有出賽紀錄。", "No games played yet.")} />
          {history.length > 0 && (
            <p className="text-xs text-text-muted">
              {tr("總評變化：", "Overall by season: ")}{[...history].sort((a, b) => a.season - b.season).map((h) => `${h.season} ${h.overall}`).join(" → ")} → {league.season} {p.overall}
            </p>
          )}
          {awards.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {awards.sort((a, b) => b.season - a.season).map((a) => <li key={a.id}><Badge tone="warning">{a.season} {awardName(a.type)}</Badge></li>)}
            </ul>
          )}
          <Link to={`/l/${league.id}/roster`} className="text-xs text-accent-text hover:underline">{tr("回到名單", "Back to roster")}</Link>
        </div>
      </div>
    </div>
  );
}

export function PlayerPage() {
  return <LeagueShell title={tr("球員資料", "Player")}><PlayerView /></LeagueShell>;
}
