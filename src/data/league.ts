import Dexie from "dexie";
import {
  ACTIVE, FREE_AGENT, LEAGUE_OWNED_TABLES, SCHEMA_VERSION,
  type Contract, type Game, type League, type LeagueSettings, type Player, type PlayerGameStat, type Team, type SaveDb,
} from "../db/schema";
import { CITIES, MASCOTS, TEAM_COLORS } from "../engine/names";
import { askingSalary, generatePlayer, POSITIONS } from "../engine/players";
import { makeRng } from "../engine/rng";
import { autoRotation, simGame } from "../engine/sim";
import { loadSimTeams, seasonSetup, statRows } from "./season";

export const START_SEASON = 2027;
export const ROSTER_SIZE = 14;
export const FREE_AGENT_POOL = 24;
export const MAX_SALARY = 45000;

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
    playoffTeams: numTeams >= 16 ? 16 : numTeams >= 8 ? 8 : 4,
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
        salaryPerYear: askingSalary(p.overall, settings.minSalary, MAX_SALARY),
        startSeason: season, endSeason: season + rng.int(0, 3),
        type: p.overall < 48 ? "minimum" : "standard", option: null,
      });
    }
    return p;
  };

  identities.forEach((id, i) => {
    const teamId = crypto.randomUUID();
    // +3.5: starts the league at the talent level it settles at once drafts,
    // growth and retirements take over (measured over ten seasons). Some teams start stronger.
    const offset = 3.5 + rng.normal(0, 2.5);
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
  for (let i = 0; i < FREE_AGENT_POOL; i++) addPlayer(FREE_AGENT, rng.pick(POSITIONS), -0.5);

  // Starting payrolls fit under the cap: deals for talented teams were signed earlier, for less.
  const target = settings.salaryCap * 0.98;
  for (const t of teams) {
    const mine = contracts.filter((c) => c.teamId === t.id);
    const total = mine.reduce((n, c) => n + c.salaryPerYear, 0);
    if (total <= target) continue;
    const scale = target / total;
    for (const c of mine) c.salaryPerYear = Math.max(settings.minSalary, Math.round((c.salaryPerYear * scale) / 100) * 100);
  }

  const league: League = {
    id: leagueId, name: o.name.trim() || "我的聯盟", seed: o.seed,
    userTeamId: teams[o.userTeamIndex].id, difficulty: o.difficulty,
    season, phase: "regular", day: 0, settings, schemaVersion: SCHEMA_VERSION,
    createdAt: now, updatedAt: now,
  };
  const setup = seasonSetup(league, season, teams);

  await db.transaction("rw", [db.leagues, db.teams, db.players, db.contracts, db.games, db.teamSeasons, db.draftPicks], async () => {
    await db.leagues.add(league);
    await db.teams.bulkAdd(teams);
    await db.players.bulkAdd([...players, ...setup.prospects]);
    await db.contracts.bulkAdd(contracts);
    await db.games.bulkAdd(setup.games);
    await db.teamSeasons.bulkAdd(setup.teamSeasons);
    await db.draftPicks.bulkAdd(setup.picks);
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

export type AdvanceUntil = "day" | "week" | "phaseEnd";
export interface AdvanceResult { daysPlayed: number; gamesPlayed: number; day: number; phaseOver: boolean; ms: number }

/** Last regular-season day index with games, or -1. */
export async function lastRegularDay(db: SaveDb, league: League) {
  const last = await db.games.where("[leagueId+season+day]")
    .between([league.id, league.season, Dexie.minKey], [league.id, league.season, Dexie.maxKey])
    .filter((g) => !g.isPlayoff).last();
  return last ? last.day : -1;
}

/**
 * Regular season, day by day. Each day is one transaction: games, stats,
 * standings and league.day are written together, and only "scheduled" games
 * are simulated, so a repeated or interrupted call never plays a game twice.
 */
export async function advanceRegular(
  db: SaveDb, league: League, until: AdvanceUntil,
  onProgress?: (p: { day: number; lastDay: number }) => void,
  shouldStop?: () => boolean,
): Promise<AdvanceResult> {
  const t0 = performance.now();
  const leagueId = league.id;
  const final = await lastRegularDay(db, league);
  const start = league.day;
  if (start > final) return { daysPlayed: 0, gamesPlayed: 0, day: start, phaseOver: true, ms: 0 };
  const target = until === "day" ? start + 1 : until === "week" ? start + 7 : final + 1;
  const end = Math.min(target, final + 1);

  const { simTeams } = await loadSimTeams(db, leagueId);
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
      if (g.status !== "scheduled" || g.isPlayoff) continue;
      const home = simTeams.get(g.homeTeamId)!, away = simTeams.get(g.awayTeamId)!;
      const r = simGame(home, away, g.seed);
      const done: Game = { ...g, status: "final", scoreHome: r.scoreHome, scoreAway: r.scoreAway };
      finished.push(done);
      lines.push(...statRows(leagueId, league.season, done, home, away, r));
      for (const [team, isHome] of [[home, true], [away, false]] as const) {
        const ts = standings.get(team.id)!;
        const pf = isHome ? r.scoreHome : r.scoreAway, pa = isHome ? r.scoreAway : r.scoreHome;
        ts.pointsFor += pf;
        ts.pointsAgainst += pa;
        if (pf > pa) ts.wins++; else ts.losses++;
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
  return { daysPlayed: day - start, gamesPlayed, day, phaseOver: day > final, ms: Math.round(performance.now() - t0) };
}
