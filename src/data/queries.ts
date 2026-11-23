// Read side for the screens. Every hook re-runs when IndexedDB changes
// (Dexie liveQuery) and when the sim worker reports a write (dataVersion).
import { useSyncExternalStore } from "react";
import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { db, FREE_AGENT, type Game, type League, type Player, type PlayerGameStat, type Team, type TeamSeason } from "../db";
import { dataVersion, subscribeData } from "../worker/client";
import { lastRegularDay } from "./league";
import { champion, getBracket, type Series } from "./playoffs";
import { draftDone, draftState } from "./draft";
import { rosterProblems } from "./advance";

const useVersion = () => useSyncExternalStore(subscribeData, () => dataVersion);

export function useLeagues() {
  const v = useVersion();
  return useLiveQuery(async () => {
    const leagues = await db.leagues.orderBy("updatedAt").reverse().toArray();
    const teams = await db.teams.bulkGet(leagues.map((l) => l.userTeamId));
    return leagues.map((l, i) => ({ league: l, team: teams[i] }));
  }, [v]);
}

export interface LeagueData {
  league: League;
  teams: Team[];
  teamById: Map<string, Team>;
  userTeam: Team;
  standings: TeamSeason[];
  /** Days in the regular season. */
  lastDay: number;
  /** The current phase has nothing left to play or pick. */
  phaseDone: boolean;
  /** Why the user's team cannot play right now. */
  problems: string[];
}

export function useLeagueData(leagueId: string | undefined): LeagueData | null | undefined {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId) return null;
    const league = await db.leagues.get(leagueId);
    if (!league) return null;
    const teams = await db.teams.where("leagueId").equals(leagueId).toArray();
    const standings = await db.teamSeasons.where("[leagueId+season]").equals([leagueId, league.season]).toArray();
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const lastDay = (await lastRegularDay(db, league)) + 1;
    const phaseDone =
      league.phase === "regular" ? league.day >= lastDay
      : league.phase === "playoffs" ? !!champion(await getBracket(db, league))
      : league.phase === "draft" ? await draftDone(db, league)
      : false;
    const problems = await rosterProblems(db, leagueId);
    return { league, teams, teamById, userTeam: teamById.get(league.userTeamId)!, standings, lastDay, phaseDone, problems };
  }, [leagueId, v]);
}

export function useTeamGames(leagueId: string | undefined, teamId: string | undefined, season: number | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId || !teamId || season == null) return [];
    const [home, away] = await Promise.all([
      db.games.where("[leagueId+homeTeamId+season]").equals([leagueId, teamId, season]).toArray(),
      db.games.where("[leagueId+awayTeamId+season]").equals([leagueId, teamId, season]).toArray(),
    ]);
    return [...home, ...away].sort((a, b) => a.day - b.day);
  }, [leagueId, teamId, season, v]);
}

export interface RosterRow {
  player: Player;
  salary: number;
  contractEnd: number;
  minutes: number;
  starter: boolean;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
}

export function useRoster(leagueId: string | undefined, team: Team | undefined, season: number | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId || !team || season == null) return undefined;
    const players = await db.players.where("[leagueId+teamId]").equals([leagueId, team.id]).toArray();
    const contracts = await db.contracts.where("[leagueId+teamId]").equals([leagueId, team.id]).toArray();
    const rows: RosterRow[] = [];
    for (const p of players) {
      const c = contracts.find((x) => x.playerId === p.id && x.endSeason >= season);
      const lines = (await db.playerGameStats.where("[playerId+season]").equals([p.id, season]).toArray()).filter((l) => !l.isPlayoff);
      const gp = lines.length;
      const avg = (k: keyof PlayerGameStat) => (gp ? lines.reduce((n, l) => n + (l[k] as number), 0) / gp : 0);
      rows.push({
        player: p, salary: c?.salaryPerYear ?? 0, contractEnd: c?.endSeason ?? season,
        minutes: team.rotation.minutes[p.id] ?? 0, starter: team.rotation.starters.includes(p.id),
        gp, pts: avg("pts"), reb: avg("reb"), ast: avg("ast"),
      });
    }
    return rows;
  }, [leagueId, team?.id, season, v]);
}

export function usePayroll(leagueId: string | undefined, teamId: string | undefined, season: number | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId || !teamId || season == null) return 0;
    const cs = await db.contracts.where("[leagueId+teamId]").equals([leagueId, teamId]).toArray();
    return cs.filter((c) => c.startSeason <= season && c.endSeason >= season).reduce((n, c) => n + c.salaryPerYear, 0);
  }, [leagueId, teamId, season, v]);
}

export interface BoxScore {
  game: Game;
  lines: (PlayerGameStat & { player: Player })[];
}

export function useBoxScore(gameId: string | undefined) {
  const v = useVersion();
  return useLiveQuery(async (): Promise<BoxScore | null> => {
    if (!gameId) return null;
    const game = await db.games.get(gameId);
    if (!game) return null;
    const stats = await db.playerGameStats.where("gameId").equals(gameId).toArray();
    const players = await db.players.bulkGet(stats.map((s) => s.playerId));
    return { game, lines: stats.map((s, i) => ({ ...s, player: players[i]! })) };
  }, [gameId, v]);
}

export const isFreeAgent = (p: Player) => p.teamId === FREE_AGENT;

export function useBracket(league: League | undefined) {
  const v = useVersion();
  return useLiveQuery(async (): Promise<Series[][] | undefined> => (league ? getBracket(db, league) : undefined), [league?.id, league?.season, league?.day, v]);
}

export function useDraft(league: League | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!league) return undefined;
    const st = await draftState(db, league);
    const drafted = await db.players.bulkGet(st.picks.filter((p) => p.playerId).map((p) => p.playerId!));
    return { ...st, drafted: new Map(drafted.filter((p): p is Player => !!p).map((p) => [p.id, p])) };
  }, [league?.id, league?.season, league?.phase, v]);
}

export function useEvents(leagueId: string | undefined, limit = 8) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId) return [];
    const all = await db.events.where("leagueId").equals(leagueId).toArray();
    return all.sort((a, b) => b.season - a.season || b.day - a.day).slice(0, limit);
  }, [leagueId, limit, v]);
}

export function usePlayer(playerId: string | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!playerId) return null;
    const player = await db.players.get(playerId);
    if (!player) return null;
    const lines = await db.playerGameStats.where("[playerId+season]")
      .between([playerId, Dexie.minKey], [playerId, Dexie.maxKey]).toArray();
    const contracts = (await db.contracts.where("[playerId+endSeason]")
      .between([playerId, Dexie.minKey], [playerId, Dexie.maxKey]).toArray());
    const history = await db.ratingHistory.where("[playerId+season]")
      .between([playerId, Dexie.minKey], [playerId, Dexie.maxKey]).toArray();
    const awards = await db.awards.where("playerId").equals(playerId).toArray();
    const team = player.teamId === FREE_AGENT ? null : await db.teams.get(player.teamId);
    const seasonTotals = await db.playerSeasonStats.where("[playerId+season]")
      .between([playerId, Dexie.minKey], [playerId, Dexie.maxKey]).toArray();
    return { player, lines, contracts, history, awards, team, seasonTotals };
  }, [playerId, v]);
}

export function useAwards(leagueId: string | undefined) {
  const v = useVersion();
  return useLiveQuery(async () => {
    if (!leagueId) return undefined;
    const awards = await db.awards.where("leagueId").equals(leagueId).toArray();
    const players = new Map((await db.players.bulkGet(awards.filter((a) => a.playerId).map((a) => a.playerId!))).filter(Boolean).map((p) => [p!.id, p!]));
    const seasonStats = await db.playerSeasonStats.where("leagueId").equals(leagueId).toArray();
    const teamSeasons = await db.teamSeasons.where("leagueId").equals(leagueId).toArray();
    return { awards, players, seasonStats, teamSeasons };
  }, [leagueId, v]);
}
