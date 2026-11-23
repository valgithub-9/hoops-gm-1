import Dexie from "dexie";
import {
  ACTIVE, FREE_AGENT, LEAGUE_OWNED_TABLES, SCHEMA_VERSION,
  type Contract, type Game, type League, type LeagueSettings, type Player, type PlayerGameStat,
  type Team, type TeamSeason, type SaveDb,
} from "../db/schema";
import { CITIES, MASCOTS, TEAM_COLORS } from "../engine/names";
import { askingSalary, generatePlayer, POSITIONS } from "../engine/players";
import { makeRng } from "../engine/rng";
import { makeSchedule } from "../engine/schedule";
import { autoRotation, simGame, type SimTeam } from "../engine/sim";

export const START_SEASON = 2027;
export const ROSTER_SIZE = 14;
export const FREE_AGENT_POOL = 24;

export interface NewLeagueOptions {
  name: string;
  numTeams: number;
  gamesPerSeason: number;
  userTeamIndex: number;
  difficulty: League["difficulty"];
  seed: string;
}

export interface TeamIdentity { city: string; name: string; abbrev: string; colors: { primary: string; secondary: string } }

/** Team names and colours for a seed, so S02 can show the list before creating anything. */
export function previewTeams(seed: string, numTeams: number): TeamIdentity[] {
  const rng = makeRng(`${seed}:teams`);
  const cities = rng.shuffle([...CITIES]).slice(0, numTeams);
  const mascots = rng.shuffle([...MASCOTS]).slice(0, numTeams);
  const colors = rng.shuffle([...TEAM_COLORS]).slice(0, numTeams);
  const used = new Set<string>();
  return cities.map((city, i) => {
    const words = city.toUpperCase().split(" ");
    const letters = words.join("");
    const candidates = [words.length > 1 ? words[0][0] + words[1].slice(0, 2) : letters.slice(0, 3)];
    for (let a = 1; a < letters.length; a++) for (let b = a + 1; b < letters.length; b++) candidates.push(letters[0] + letters[a] + letters[b]);
    const abbrev = candidates.find((c) => !used.has(c))!;
    used.add(abbrev);
    return { city, name: mascots[i], abbrev, colors: { primary: colors[i][0], secondary: colors[i][1] } };
  });
}

export function defaultSettings(numTeams: number, gamesPerSeason: number): LeagueSettings {
  return {
    numTeams,
    gamesPerSeason,
    rosterMin: 13,
    rosterMax: 15,
    salaryCap: 140000,
    luxuryTax: 170000,
    minSalary: 1100,
    maxContractYears: 5,
    tradeDeadlineDay: Math.floor(gamesPerSeason * 0.6),
    playoffTeams: numTeams >= 16 ? 16 : 8,
    keepPlayByPlaySeasons: 2,
  };
}

export async function createLeague(db: SaveDb, o: NewLeagueOptions): Promise<string> {
  if (o.numTeams % 2 !== 0 || o.numTeams < 4 || o.numTeams > CITIES.length) throw new Error("隊數必須是 4 到 30 之間的偶數");
  const rng = makeRng(`${o.seed}:players`);
  const settings = defaultSettings(o.numTeams, o.gamesPerSeason);
  const now = new Date().toISOString();
  const leagueId = crypto.randomUUID();
  const season = START_SEASON;

  const identities = previewTeams(o.seed, o.numTeams);
  const teams: Team[] = [];
  const players: Player[] = [];
  const contracts: Contract[] = [];

  const addPlayer = (teamId: string, pos: (typeof POSITIONS)[number], offset: number) => {
    const g = generatePlayer(rng, pos, offset);
    const p: Player = {
      id: crypto.randomUUID(), leagueId, teamId,
      firstName: g.firstName, lastName: g.lastName, bornYear: season - g.age,
      position: g.position, heightCm: g.heightCm, ratings: g.ratings, overall: g.overall, potential: g.potential,
      injury: null, draft: null, isProspect: 0, retiredSeason: ACTIVE, portraitSeed: g.portraitSeed,
    };
    players.push(p);
    if (teamId !== FREE_AGENT) {
      contracts.push({
        id: crypto.randomUUID(), leagueId, playerId: p.id, teamId,
        salaryPerYear: askingSalary(p.overall, settings.minSalary, 45000),
        startSeason: season, endSeason: season + rng.int(0, 3),
        type: p.overall < 48 ? "minimum" : "standard", option: null,
      });
    }
    return p;
  };

  identities.forEach((id, i) => {
    const teamId = crypto.randomUUID();
    const offset = rng.normal(0, 2.5); // some franchises start stronger than others
    const roster: Player[] = [];
    const positions = [...POSITIONS, ...POSITIONS, ...Array.from({ length: ROSTER_SIZE - 10 }, () => rng.pick(POSITIONS))];
    for (const pos of positions) roster.push(addPlayer(teamId, pos, offset));
    teams.push({
      id: teamId, leagueId, ...id,
      crestSeed: Math.floor(rng() * 1e9).toString(36),
      conference: i < o.numTeams / 2 ? 0 : 1,
      division: 0,
      isUser: i === o.userTeamIndex,
      strategy: "contending",
      rotation: autoRotation(roster),
    });
  });
  for (let i = 0; i < FREE_AGENT_POOL; i++) addPlayer(FREE_AGENT, rng.pick(POSITIONS), -4);

  const schedule = makeSchedule(o.numTeams, o.gamesPerSeason, makeRng(`${o.seed}:schedule:${season}`));
  const games: Game[] = schedule.map((g, n) => ({
    id: crypto.randomUUID(), leagueId, season, day: g.day,
    homeTeamId: teams[g.home].id, awayTeamId: teams[g.away].id,
    isPlayoff: 0, seriesId: null, status: "scheduled",
    seed: `${o.seed}:game:${season}:${n}`,
    scoreHome: null, scoreAway: null, playByPlay: null,
  }));
  const teamSeasons: TeamSeason[] = teams.map((t) => ({
    id: crypto.randomUUID(), leagueId, teamId: t.id, season,
    wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, playoffResult: null, playoffRoundReached: null,
  }));
  const league: League = {
    id: leagueId, name: o.name.trim() || "我的聯盟", seed: o.seed,
    userTeamId: teams[o.userTeamIndex].id, difficulty: o.difficulty,
    season, phase: "regular", day: 0, settings, schemaVersion: SCHEMA_VERSION,
    createdAt: now, updatedAt: now,
  };

  await db.transaction("rw", [db.leagues, db.teams, db.players, db.contracts, db.games, db.teamSeasons], async () => {
    await db.leagues.add(league);
    await db.teams.bulkAdd(teams);
    await db.players.bulkAdd(players);
    await db.contracts.bulkAdd(contracts);
    await db.games.bulkAdd(games);
    await db.teamSeasons.bulkAdd(teamSeasons);
  });
  return leagueId;
}

export async function deleteLeague(db: SaveDb, leagueId: string) {
  const tables = [db.leagues, ...LEAGUE_OWNED_TABLES.map((t) => db[t])];
  await db.transaction("rw", tables, async () => {
    for (const t of LEAGUE_OWNED_TABLES) await db[t].where("leagueId").equals(leagueId).delete();
    await db.leagues.delete(leagueId);
  });
}

export type AdvanceUntil = "day" | "week" | "regularSeasonEnd";
export interface AdvanceResult { daysPlayed: number; gamesPlayed: number; day: number; seasonOver: boolean; ms: number }

/** Last day index with games this season, or -1. */
async function lastDay(db: SaveDb, league: League) {
  const last = await db.games.where("[leagueId+season+day]")
    .between([league.id, league.season, Dexie.minKey], [league.id, league.season, Dexie.maxKey]).last();
  return last ? last.day : -1;
}

/**
 * Simulates day by day. Each day is one transaction: games, stats, standings
 * and league.day are written together, and only "scheduled" games are
 * simulated, so a repeated or interrupted call never plays a game twice.
 */
export async function advance(
  db: SaveDb, leagueId: string, until: AdvanceUntil,
  onProgress?: (p: { day: number; lastDay: number }) => void,
  shouldStop?: () => boolean,
): Promise<AdvanceResult> {
  const t0 = performance.now();
  const league = await db.leagues.get(leagueId);
  if (!league) throw new Error("找不到這個聯盟");
  const final = await lastDay(db, league);
  const start = league.day;
  if (league.phase !== "regular" || start > final) {
    return { daysPlayed: 0, gamesPlayed: 0, day: start, seasonOver: true, ms: 0 };
  }
  const target = until === "day" ? start + 1 : until === "week" ? start + 7 : final + 1;
  const end = Math.min(target, final + 1);

  // Load everything a day needs once; nothing about rosters changes mid-advance in v1.
  const teams = await db.teams.where("leagueId").equals(leagueId).toArray();
  const players = await db.players.where("leagueId").equals(leagueId).toArray();
  const byTeam = new Map<string, Player[]>();
  for (const p of players) {
    if (p.teamId === FREE_AGENT || p.retiredSeason !== ACTIVE) continue;
    (byTeam.get(p.teamId) ?? byTeam.set(p.teamId, []).get(p.teamId)!).push(p);
  }
  const simTeams = new Map<string, SimTeam>();
  for (const t of teams) {
    const roster = byTeam.get(t.id) ?? [];
    simTeams.set(t.id, {
      id: t.id,
      tactics: t.rotation.tactics,
      players: roster.map((p) => ({
        id: p.id, ratings: p.ratings, overall: p.overall,
        minutes: t.rotation.minutes[p.id] ?? 0, starter: t.rotation.starters.includes(p.id),
      })),
    });
  }
  const standings = new Map(
    (await db.teamSeasons.where("[leagueId+season]").equals([leagueId, league.season]).toArray()).map((s) => [s.teamId, s]),
  );

  let gamesPlayed = 0, day = start;
  for (; day < end; day++) {
    if (shouldStop?.()) break;
    const todays = await db.games.where("[leagueId+season+day]").equals([leagueId, league.season, day]).toArray();
    const finished: Game[] = [];
    const lines: PlayerGameStat[] = [];
    for (const g of todays) {
      if (g.status !== "scheduled") continue;
      const home = simTeams.get(g.homeTeamId)!, away = simTeams.get(g.awayTeamId)!;
      const r = simGame(home, away, g.seed);
      finished.push({ ...g, status: "final", scoreHome: r.scoreHome, scoreAway: r.scoreAway });
      for (const [team, isHome] of [[home, true], [away, false]] as const) {
        const ts = standings.get(team.id)!;
        const pf = isHome ? r.scoreHome : r.scoreAway, pa = isHome ? r.scoreAway : r.scoreHome;
        ts.pointsFor += pf;
        ts.pointsAgainst += pa;
        if (pf > pa) ts.wins++; else ts.losses++;
        for (const p of team.players) {
          const s = r.stats.get(p.id)!;
          if (s.min === 0) continue;
          const { oreb: _oreb, ...line } = s;
          lines.push({ id: crypto.randomUUID(), leagueId, gameId: g.id, season: league.season, playerId: p.id, teamId: team.id, ...line });
        }
      }
    }
    await db.transaction("rw", [db.games, db.playerGameStats, db.teamSeasons, db.leagues], async () => {
      await db.games.bulkPut(finished);
      await db.playerGameStats.bulkAdd(lines);
      await db.teamSeasons.bulkPut([...standings.values()]);
      await db.leagues.update(leagueId, { day: day + 1, updatedAt: new Date().toISOString() });
    });
    gamesPlayed += finished.length;
    onProgress?.({ day: day + 1, lastDay: final + 1 });
  }
  return { daysPlayed: day - start, gamesPlayed, day, seasonOver: day > final, ms: Math.round(performance.now() - t0) };
}
