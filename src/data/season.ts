import {
  ACTIVE, FREE_AGENT,
  type DraftPick, type Game, type GameEvent, type League, type Player, type PlayerGameStat, type SaveDb, type Team, type TeamSeason,
} from "../db/schema";
import { generatePlayer, POSITIONS } from "../engine/players";
import { makeRng, type Rng } from "../engine/rng";
import { makeSchedule } from "../engine/schedule";
import type { GameResult, SimTeam } from "../engine/sim";
import { tr } from "../i18n";

/** Everything a new season needs: schedule, standings rows, draft picks and the draft class. */
export function seasonSetup(league: Pick<League, "id" | "seed" | "settings">, season: number, teams: Team[], existingPicks: DraftPick[] = []) {
  const { settings } = league;
  const schedule = makeSchedule(settings.numTeams, settings.gamesPerSeason, makeRng(`${league.seed}:schedule:${season}`));
  const games: Game[] = schedule.map((g, n) => ({
    id: crypto.randomUUID(), leagueId: league.id, season, day: g.day,
    homeTeamId: teams[g.home].id, awayTeamId: teams[g.away].id,
    isPlayoff: 0, seriesId: null, status: "scheduled",
    seed: `${league.seed}:game:${season}:${n}`,
    scoreHome: null, scoreAway: null, playByPlay: null,
  }));
  const teamSeasons: TeamSeason[] = teams.map((t) => ({
    id: crypto.randomUUID(), leagueId: league.id, teamId: t.id, season,
    wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, playoffResult: null, playoffRoundReached: null,
  }));
  // Picks for this season's draft and next season's, so future picks can be traded.
  // Only the ones that do not exist yet: next season's were made a year ago.
  const have = new Set(existingPicks.map((p) => `${p.season}|${p.round}|${p.originalTeamId}`));
  const picks: DraftPick[] = [season, season + 1].flatMap((s) => teams.flatMap((t) => ([1, 2] as const)
    .filter((round) => !have.has(`${s}|${round}|${t.id}`))
    .map((round) => ({
      id: crypto.randomUUID(), leagueId: league.id, season: s, round,
      originalTeamId: t.id, ownerTeamId: t.id, pickNo: null, playerId: null,
    }))));
  const prospects = draftClass(league, season, makeRng(`${league.seed}:draftclass:${season}`));
  return { games, teamSeasons, picks, prospects };
}

/** Prospects for the draft at the end of `season`: young, raw, with upside. */
export function draftClass(league: Pick<League, "id" | "settings">, season: number, rng: Rng): Player[] {
  const n = league.settings.numTeams * 2 + 12;
  return Array.from({ length: n }, () => {
    const age = rng.int(19, 22);
    const g = generatePlayer(rng, rng.pick(POSITIONS), -9, age);
    const ovr = g.overall;
    return {
      id: crypto.randomUUID(), leagueId: league.id, teamId: FREE_AGENT,
      firstName: g.firstName, lastName: g.lastName, bornYear: season + 1 - age,
      position: g.position, heightCm: g.heightCm, ratings: g.ratings, overall: ovr,
      potential: Math.min(99, ovr + rng.int(4, 28)),
      injury: null, draft: null, isProspect: 1, retiredSeason: ACTIVE, portraitSeed: g.portraitSeed,
    } satisfies Player;
  });
}

/** Builds the simulation input for every team from the save. */
export async function loadSimTeams(db: SaveDb, leagueId: string) {
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
        id: p.id, ratings: p.ratings, overall: p.overall, position: p.position,
        minutes: t.rotation.minutes[p.id] ?? 0, starter: t.rotation.starters.includes(p.id),
        injuryGames: p.injury?.gamesRemaining ?? 0,
      })),
    });
  }
  return { teams, simTeams, playerById: new Map(players.map((p) => [p.id, p])) };
}

/**
 * After a game: players who sat it out injured count down one game, then this
 * game's new injuries are added. Mutates the in-memory sim teams and players;
 * returns the ids of players whose injury changed, to be written with the day.
 */
export function applyInjuries(teams: SimTeam[], players: Map<string, Player>, r: GameResult, changed: Set<string>) {
  const fresh = new Set(r.injuries.map((i) => i.playerId));
  for (const t of teams) {
    for (const sp of t.players) {
      if (!sp.injuryGames || fresh.has(sp.id)) continue;
      sp.injuryGames--;
      const p = players.get(sp.id)!;
      p.injury = sp.injuryGames > 0 ? { ...p.injury!, gamesRemaining: sp.injuryGames } : null;
      changed.add(sp.id);
    }
  }
  for (const i of r.injuries) {
    const sp = teams.flatMap((t) => t.players).find((x) => x.id === i.playerId)!;
    sp.injuryGames = i.gamesOut;
    players.get(i.playerId)!.injury = { type: i.type, gamesRemaining: i.gamesOut };
    changed.add(i.playerId);
  }
}

/** Inbox items for injuries on the user's team. A long injury to a rotation player pauses advancing. */
export function injuryEvents(league: Pick<League, "id" | "season" | "day" | "userTeamId">, r: GameResult, team: SimTeam | undefined, players: Map<string, Player>) {
  const events: GameEvent[] = [];
  let pause: string | null = null;
  if (!team || team.id !== league.userTeamId) return { events, pause };
  for (const i of r.injuries.filter((x) => x.teamId === team.id)) {
    const p = players.get(i.playerId)!;
    const sp = team.players.find((x) => x.id === i.playerId)!;
    const serious = i.gamesOut >= 5 && sp.minutes >= 10;
    const text = tr(`${fullName(p)} ${i.type}，預計缺席 ${i.gamesOut} 場。${serious ? "他的上場時間會先分給隊友，可以到「輪替」調整。" : ""}`,
      `${fullName(p)}: ${i.type.toLowerCase()}, out about ${i.gamesOut} games.${serious ? " His minutes go to teammates for now; adjust in Rotation." : ""}`);
    events.push(newEvent(league, "injury", { text, playerId: p.id }, serious));
    if (serious && !pause) pause = text;
  }
  return { events, pause };
}

/** Box-score rows for one finished game. */
export function statRows(leagueId: string, season: number, game: Game, home: SimTeam, away: SimTeam, r: GameResult): PlayerGameStat[] {
  const rows: PlayerGameStat[] = [];
  for (const team of [home, away]) {
    for (const p of team.players) {
      const s = r.stats.get(p.id)!;
      if (s.min === 0 && s.pf === 0 && s.fga === 0 && s.fta === 0 && s.reb === 0 && s.tov === 0) continue;
      const { oreb: _oreb, ...line } = s;
      rows.push({ id: crypto.randomUUID(), leagueId, gameId: game.id, season, isPlayoff: game.isPlayoff, playerId: p.id, teamId: team.id, ...line });
    }
  }
  return rows;
}

export function newEvent(league: Pick<League, "id" | "season" | "day">, type: GameEvent["type"], payload: Record<string, unknown>, blocksAdvance = false): GameEvent {
  return { id: crypto.randomUUID(), leagueId: league.id, season: league.season, day: league.day, type, payload, blocksAdvance, read: 0 };
}

export const fullName = (p: Pick<Player, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`;
