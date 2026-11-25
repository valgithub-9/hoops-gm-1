import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Field, Select } from "../../components/ui/Field";
import { TeamChip } from "../../components/ui/TeamChip";
import { useLeaders, type LeaderRow } from "../../data/queries";
import { tr } from "../../i18n";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

type Category = {
  key: string;
  label: string;
  value: (r: LeaderRow) => number;
  format: (v: number) => string;
  /** Who counts: enough games, and for percentages enough attempts per game. */
  qualifies: (r: LeaderRow, minGames: number) => boolean;
};

const pg = (k: keyof Omit<LeaderRow, "player" | "teamId" | "gp">) => (r: LeaderRow) => r[k] / r.gp;
const pct = (m: "fgm" | "tpm" | "ftm", a: "fga" | "tpa" | "fta") => (r: LeaderRow) => (r[a] ? r[m] / r[a] : 0);
const one = (v: number) => v.toFixed(1);
const three = (v: number) => `${(v * 100).toFixed(1)}%`;
const games = (r: LeaderRow, minGames: number) => r.gp >= minGames;

const categories = (): Category[] => [
  { key: "pts", label: tr("得分", "Points"), value: pg("pts"), format: one, qualifies: games },
  { key: "reb", label: tr("籃板", "Rebounds"), value: pg("reb"), format: one, qualifies: games },
  { key: "ast", label: tr("助攻", "Assists"), value: pg("ast"), format: one, qualifies: games },
  { key: "stl", label: tr("抄截", "Steals"), value: pg("stl"), format: one, qualifies: games },
  { key: "blk", label: tr("火鍋", "Blocks"), value: pg("blk"), format: one, qualifies: games },
  { key: "min", label: tr("上場時間", "Minutes"), value: pg("min"), format: one, qualifies: games },
  { key: "fg", label: tr("投籃命中率", "Field goal %"), value: pct("fgm", "fga"), format: three, qualifies: (r, m) => games(r, m) && r.fga / r.gp >= 5 },
  { key: "tp", label: tr("三分命中率", "Three-point %"), value: pct("tpm", "tpa"), format: three, qualifies: (r, m) => games(r, m) && r.tpa / r.gp >= 2 },
  { key: "ft", label: tr("罰球命中率", "Free throw %"), value: pct("ftm", "fta"), format: three, qualifies: (r, m) => games(r, m) && r.fta / r.gp >= 2 },
];

// S11
function Leaders() {
  const { league, teamById, userTeam } = useLeague();
  const [season, setSeason] = useState(league.season);
  const data = useLeaders(league, season);
  if (!data) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入數據排行", "Loading leaders")} />;
  const { rows, seasons } = data;
  // Qualify with at least half of the most games anyone has played this season.
  const most = rows.reduce((n, r) => Math.max(n, r.gp), 0);
  const minGames = Math.max(1, Math.ceil(most / 2));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-[200px]">
          <Field label={tr("球季", "Season")}>{(f) => (
            <Select id={f.id} value={season} onChange={(e) => setSeason(+e.target.value)}>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}</Field>
        </div>
        <p className="text-sm text-text-muted">
          {tr(`例行賽場均。至少出賽 ${minGames} 場才列入；命中率另外要求每場出手次數。`,
            `Regular-season per-game averages. At least ${minGames} games to qualify; percentages also need enough attempts per game.`)}
        </p>
      </div>
      {most === 0 ? (
        <Card><p className="text-text-muted">{tr("這一季還沒有比賽。推進幾天之後再來看。", "No games this season yet. Come back after a few days of play.")}</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {categories().map((c) => {
            const top = rows.filter((r) => c.qualifies(r, minGames)).sort((a, b) => c.value(b) - c.value(a)).slice(0, 10);
            return (
              <Card key={c.key} title={c.label}>
                {top.length === 0 ? <p className="text-sm text-text-muted">{tr("還沒有人達到門檻。", "Nobody qualifies yet.")}</p> : (
                  <ol className="-mx-2">
                    {top.map((r, i) => {
                      const t = teamById.get(r.teamId);
                      const mine = r.teamId === userTeam.id;
                      return (
                        <li key={r.player.id} className={cn("flex items-center gap-2 rounded-md px-2 h-[36px] text-sm", mine && "bg-accent/10")}>
                          <span className="num w-[20px] text-right font-mono text-xs text-text-subtle">{i + 1}</span>
                          {t && <TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={22} />}
                          <Link to={`/l/${league.id}/player/${r.player.id}`} className={cn("flex-1 min-w-0 truncate hover:text-accent-text", mine && "text-accent-text font-semibold")}>
                            {r.player.firstName[0]}. {r.player.lastName}
                          </Link>
                          <span className={cn("num font-mono", i === 0 ? "text-scoreboard font-bold" : "text-text")}>{c.format(c.value(r))}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LeadersPage() {
  return <LeagueShell title={tr("數據排行", "League Leaders")}><Leaders /></LeagueShell>;
}
