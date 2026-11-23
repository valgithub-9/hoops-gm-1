import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, Stat } from "../../components/ui/Card";
import { ContractTag } from "../../components/ui/ContractTag";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Ovr, RatingBar } from "../../components/ui/RatingBar";
import { TeamChip } from "../../components/ui/TeamChip";
import { AWARD_NAMES } from "../../data/awards";
import { scoutedPotential } from "../../data/draft";
import { usePlayer } from "../../data/queries";
import { ACTIVE, type PlayerGameStat, type PlayerSeasonStat } from "../../db";
import { RATING_KEYS, RATING_LABELS } from "../../engine/players";
import { LeagueShell, useLeague } from "./LeagueShell";

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
const cols: Column<SeasonRow>[] = [
  { key: "season", header: "球季", sticky: true, cell: (r) => <span>{r.season}{r.playoffs && <Badge tone="accent" className="ml-2">季後賽</Badge>}</span> },
  { key: "team", header: "球隊", cell: (r) => r.teamAbbrev },
  { key: "gp", header: "出賽", numeric: true, cell: (r) => r.gp },
  { key: "min", header: "分鐘", numeric: true, cell: (r) => f1(r.min) },
  { key: "pts", header: "得分", numeric: true, cell: (r) => <span className="font-bold text-text">{f1(r.pts)}</span> },
  { key: "reb", header: "籃板", numeric: true, cell: (r) => f1(r.reb) },
  { key: "ast", header: "助攻", numeric: true, cell: (r) => f1(r.ast) },
  { key: "stl", header: "抄截", numeric: true, cell: (r) => f1(r.stl) },
  { key: "blk", header: "火鍋", numeric: true, cell: (r) => f1(r.blk) },
  { key: "fg", header: "FG%", numeric: true, cell: (r) => r.fg },
  { key: "tp", header: "3P%", numeric: true, cell: (r) => r.tp },
  { key: "ft", header: "FT%", numeric: true, cell: (r) => r.ft },
];

// S05
function PlayerView() {
  const { playerId } = useParams();
  const { league, teamById } = useLeague();
  const data = usePlayer(playerId);
  if (data === undefined) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入球員資料" />;
  if (data === null) return <p className="text-text-muted">找不到這位球員。</p>;
  const { player: p, lines, contracts, history, awards, team, seasonTotals } = data;
  const age = league.season - p.bornYear;
  const contract = contracts.filter((c) => c.endSeason >= league.season).sort((a, b) => b.endSeason - a.endSeason)[0];
  const scout = scoutedPotential(p);
  const prev = history.sort((a, b) => b.season - a.season)[0];
  const abbrev = (id: string) => teamById.get(id)?.abbrev ?? "—";
  const live = seasons(lines, abbrev);
  const rows = [...live, ...archived(seasonTotals, new Set(live.map((r) => r.key)), abbrev)]
    .sort((a, b) => b.season - a.season || Number(a.playoffs) - Number(b.playoffs));
  const status = p.retiredSeason !== ACTIVE ? `${p.retiredSeason} 年退休` : p.isProspect ? "選秀新秀" : team ? `${team.city} ${team.name}` : "自由球員";

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />返回
      </button>
      <div className="flex flex-wrap items-center gap-4">
        <Ovr value={p.overall} size="lg" />
        <div className="min-w-0">
          <h2 className="font-display text-xl uppercase break-words">{p.firstName} {p.lastName}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            {team && <TeamChip abbrev={team.abbrev} primary={team.colors.primary} size={20} />}
            <span>{status}</span><span>· {p.position}</span><span>· {age} 歲</span><span>· {p.heightCm} cm</span>
            {p.draft && <span>· {p.draft.season} 選秀第 {p.draft.pick} 順位</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="總評" value={p.overall} sub={prev ? `去年 ${prev.overall}（${p.overall - prev.overall >= 0 ? "+" : ""}${p.overall - prev.overall}）` : "第一個球季"} />
        <Stat label="潛力（球探估計）" value={age >= 27 ? "已定型" : `${scout[0]}–${scout[1]}`} sub={age >= 27 ? "27 歲後不再成長" : "實際潛力不會顯示"} />
        <Stat label="合約" value={contract ? <ContractTag salary={contract.salaryPerYear} years={contract.endSeason - league.season + 1} kind={contract.type} expiring={contract.endSeason === league.season} /> : "無"}
          sub={contract ? `到 ${contract.endSeason} 年` : undefined} />
        <Stat label="獎項" value={awards.length} sub={awards.slice(0, 2).map((a) => `${a.season} ${AWARD_NAMES[a.type]}`).join("、") || "—"} />
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        <Card title="能力值">
          <div className="space-y-3">
            {RATING_KEYS.map((k) => (
              <RatingBar key={k} label={RATING_LABELS[k]} value={p.ratings[k]} delta={prev ? p.ratings[k] - prev.ratings[k] : undefined} />
            ))}
          </div>
        </Card>
        <div className="space-y-3 min-w-0">
          <h3 className="font-display text-lg uppercase">生涯數據（場均）</h3>
          <DataTable caption="生涯數據" rows={rows} columns={cols} rowKey={(r) => r.key} empty="還沒有出賽紀錄。" />
          {history.length > 0 && (
            <p className="text-xs text-text-muted">
              總評變化：{[...history].sort((a, b) => a.season - b.season).map((h) => `${h.season} ${h.overall}`).join(" → ")} → {league.season} {p.overall}
            </p>
          )}
          {awards.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {awards.sort((a, b) => b.season - a.season).map((a) => <li key={a.id}><Badge tone="warning">{a.season} {AWARD_NAMES[a.type]}</Badge></li>)}
            </ul>
          )}
          <Link to={`/l/${league.id}/roster`} className="text-xs text-accent-text hover:underline">回到名單</Link>
        </div>
      </div>
    </div>
  );
}

export function PlayerPage() {
  return <LeagueShell title="球員資料"><PlayerView /></LeagueShell>;
}
