// Read side for the screens. Every hook re-runs when IndexedDB changes
// (Dexie liveQuery) and when the sim worker reports a write (dataVersion).
import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, FREE_AGENT, type Game, type League, type Player, type PlayerGameStat, type Team, type TeamSeason } from "../db";
import { dataVersion, subscribeData } from "../worker/client";

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
  lastDay: number;
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
    const lastDay = Math.max(0, league.settings.gamesPerSeason);
    return { league, teams, teamById, userTeam: teamById.get(league.userTeamId)!, standings, lastDay };
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
      const lines = await db.playerGameStats.where("[playerId+season]").equals([p.id, season]).toArray();
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
