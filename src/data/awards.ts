import type { Award, League, Player, PlayerGameStat, PlayerSeasonStat, SaveDb, Team, TeamSeason } from "../db/schema";
import { lang } from "../i18n";

type Totals = Omit<PlayerSeasonStat, "id" | "leagueId" | "playerId" | "season" | "teamId" | "isPlayoff">;
const zero = (): Totals => ({ gp: 0, gs: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0 });

/** Sums game lines into one row per player, team and regular/playoffs. */
export function aggregate(leagueId: string, season: number, lines: PlayerGameStat[], starters: Set<string>): PlayerSeasonStat[] {
  const map = new Map<string, PlayerSeasonStat>();
  for (const l of lines) {
    const key = `${l.playerId}|${l.teamId}|${l.isPlayoff}`;
    let row = map.get(key);
    if (!row) {
      row = { id: crypto.randomUUID(), leagueId, playerId: l.playerId, season, teamId: l.teamId, isPlayoff: l.isPlayoff, ...zero() };
      map.set(key, row);
    }
    row.gp++;
    if (starters.has(l.playerId)) row.gs++;
    for (const k of ["min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "pf"] as const) row[k] += l[k];
  }
  return [...map.values()];
}

const perGame = (s: PlayerSeasonStat, k: keyof Totals) => (s.gp ? (s[k] as number) / s.gp : 0);

/** One number for "how much did this player help": box-score impact per game. */
export const impact = (s: PlayerSeasonStat) =>
  perGame(s, "pts") + 1.2 * perGame(s, "reb") + 1.5 * perGame(s, "ast") + 2 * (perGame(s, "stl") + perGame(s, "blk")) - perGame(s, "tov")
  - 0.4 * (perGame(s, "fga") - perGame(s, "fgm"));

export async function computeAwards(
  db: SaveDb, league: League, teams: Team[], standings: TeamSeason[], championId: string, finalsSeriesId: string,
): Promise<{ awards: Award[]; seasonStats: PlayerSeasonStat[] }> {
  const lines = await db.playerGameStats.where("[leagueId+season]").equals([league.id, league.season]).toArray();
  const starters = new Set(teams.flatMap((t) => t.rotation.starters));
  const seasonStats = aggregate(league.id, league.season, lines, starters);
  const players = new Map((await db.players.where("leagueId").equals(league.id).toArray()).map((p) => [p.id, p]));
  const winPct = new Map(standings.map((s) => [s.teamId, s.wins / Math.max(1, s.wins + s.losses)]));
  const minGames = Math.ceil(league.settings.gamesPerSeason * 0.6);
  const regular = seasonStats.filter((s) => !s.isPlayoff && s.gp >= minGames);
  const award = (type: Award["type"], s: { playerId: string; teamId: string } | undefined): Award[] =>
    s ? [{ id: crypto.randomUUID(), leagueId: league.id, season: league.season, type, playerId: s.playerId, teamId: s.teamId }] : [];
  const best = (rows: PlayerSeasonStat[], score: (s: PlayerSeasonStat) => number) =>
    [...rows].sort((a, b) => score(b) - score(a));

  const mvpScore = (s: PlayerSeasonStat) => impact(s) * (0.6 + (winPct.get(s.teamId) ?? 0));
  const ranked = best(regular, mvpScore);
  const dpoy = best(regular, (s) => {
    const p: Player | undefined = players.get(s.playerId);
    const d = p ? Math.max(p.ratings.perimeterD, p.ratings.interiorD) : 50;
    return 2 * perGame(s, "stl") + 2 * perGame(s, "blk") + 0.3 * perGame(s, "reb") + (d - 50) * 0.08;
  })[0];
  const rookies = regular.filter((s) => players.get(s.playerId)?.draft?.season === league.season - 1);
  const sixth = regular.filter((s) => !starters.has(s.playerId));

  // Finals MVP: best impact in the finals, on the champion.
  const finalsGames = new Set((await db.games.where("[leagueId+season+status]").equals([league.id, league.season, "final"]).toArray())
    .filter((g) => g.seriesId === finalsSeriesId).map((g) => g.id));
  const finalsRows = aggregate(league.id, league.season, lines.filter((l) => finalsGames.has(l.gameId) && l.teamId === championId), starters);
  const fmvp = best(finalsRows, impact)[0];

  const awards: Award[] = [
    { id: crypto.randomUUID(), leagueId: league.id, season: league.season, type: "CHAMPION", playerId: null, teamId: championId },
    ...award("MVP", ranked[0]),
    ...award("DPOY", dpoy),
    ...award("ROY", best(rookies, impact)[0]),
    ...award("SMOY", best(sixth, impact)[0]),
    ...award("FINALS_MVP", fmvp),
    ...ranked.slice(0, 5).flatMap((s) => award("ALL_LEAGUE_1", s)),
    ...ranked.slice(5, 10).flatMap((s) => award("ALL_LEAGUE_2", s)),
  ];
  return { awards, seasonStats };
}

const AWARD_NAMES_ZH: Record<Award["type"], string> = {
  CHAMPION: "總冠軍", MVP: "年度最有價值球員", DPOY: "年度最佳防守球員", ROY: "年度最佳新秀", SMOY: "年度最佳第六人",
  MIP: "年度進步獎", FINALS_MVP: "總冠軍賽 MVP", ALL_LEAGUE_1: "年度第一隊", ALL_LEAGUE_2: "年度第二隊", ALL_LEAGUE_3: "年度第三隊",
};
const AWARD_NAMES_EN: Record<Award["type"], string> = {
  CHAMPION: "Champion", MVP: "Most Valuable Player", DPOY: "Defensive Player of the Year", ROY: "Rookie of the Year", SMOY: "Sixth Man of the Year",
  MIP: "Most Improved", FINALS_MVP: "Finals MVP", ALL_LEAGUE_1: "All-League First Team", ALL_LEAGUE_2: "All-League Second Team", ALL_LEAGUE_3: "All-League Third Team",
};
export const awardName = (t: Award["type"]) => (lang() === "en" ? AWARD_NAMES_EN : AWARD_NAMES_ZH)[t];
