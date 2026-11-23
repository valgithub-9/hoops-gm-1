import type { Game, GameEvent, League, PlayerGameStat, SaveDb, Team, TeamSeason } from "../db/schema";
import { simGame } from "../engine/sim";
import { conferenceStandings } from "../lib/standings";
import { computeAwards } from "./awards";
import { applyInjuries, injuryEvents, loadSimTeams, newEvent, statRows } from "./season";
import type { AdvanceResult, AdvanceUntil } from "./league";

export const WINS_NEEDED = 4;
const HOME_GAMES_FOR_TOP = new Set([1, 2, 5, 7]);

export interface Series {
  id: string;
  round: number; // 0 = first round; the last round is the finals
  conference: 0 | 1 | null; // null = finals
  top: string | null; // better seed, home court
  bottom: string | null;
  topSeed: number | null;
  bottomSeed: number | null;
  winsTop: number;
  winsBottom: number;
  winner: string | null;
}

/** Standard bracket order: 1v8, 4v5, 2v7, 3v6 for eight seeds. */
export function bracketOrder(n: number): number[] {
  let seeds = [1];
  while (seeds.length < n) {
    const size = seeds.length * 2;
    seeds = seeds.flatMap((s) => [s, size + 1 - s]);
  }
  return seeds;
}

export const roundsFor = (playoffTeams: number) => Math.log2(playoffTeams / 2) + 1; // conference rounds + finals

export function roundName(round: number, playoffTeams: number) {
  const total = roundsFor(playoffTeams);
  if (round === total - 1) return "總冠軍賽";
  if (round === total - 2) return "分區冠軍賽";
  if (round === total - 3) return "分區準決賽";
  return "第一輪";
}

/** The whole bracket, derived from final standings plus the playoff games played so far. */
export function buildBracket(league: League, teams: Team[], standings: TeamSeason[], playoffGames: Game[]): Series[][] {
  const perConf = league.settings.playoffTeams / 2;
  const total = roundsFor(league.settings.playoffTeams);
  const seedOf = new Map<string, number>();
  const confs = ([0, 1] as const).map((c) => conferenceStandings(teams, standings, c).slice(0, perConf));
  confs.forEach((rows) => rows.forEach((r) => seedOf.set(r.team.id, r.rank)));
  const recordOf = (id: string) => {
    const s = standings.find((x) => x.teamId === id)!;
    return s.wins / Math.max(1, s.wins + s.losses);
  };

  const fill = (s: Series): Series => {
    for (const g of playoffGames) {
      if (g.seriesId !== s.id || g.status !== "final") continue;
      const winner = g.scoreHome! > g.scoreAway! ? g.homeTeamId : g.awayTeamId;
      if (winner === s.top) s.winsTop++; else s.winsBottom++;
    }
    s.winner = s.winsTop >= WINS_NEEDED ? s.top : s.winsBottom >= WINS_NEEDED ? s.bottom : null;
    return s;
  };
  const make = (id: string, round: number, conference: 0 | 1 | null, a: string | null, b: string | null): Series => {
    // Better seed (or better record in the finals) gets home court.
    let top = a, bottom = b;
    if (a && b) {
      const better = conference === null ? recordOf(a) >= recordOf(b) : (seedOf.get(a)! <= seedOf.get(b)!);
      if (!better) [top, bottom] = [b, a];
    }
    return fill({
      id, round, conference, top, bottom,
      topSeed: top ? seedOf.get(top) ?? null : null, bottomSeed: bottom ? seedOf.get(bottom) ?? null : null,
      winsTop: 0, winsBottom: 0, winner: null,
    });
  };

  const rounds: Series[][] = [];
  const order = bracketOrder(perConf);
  rounds.push(([0, 1] as const).flatMap((c) => {
    const bySeed = confs[c].map((r) => r.team.id);
    const out: Series[] = [];
    for (let i = 0; i < order.length; i += 2) {
      out.push(make(`${league.season}-r0-c${c}-s${i / 2}`, 0, c, bySeed[order[i] - 1], bySeed[order[i + 1] - 1]));
    }
    return out;
  }));
  for (let r = 1; r < total; r++) {
    const prev = rounds[r - 1];
    if (r === total - 1) {
      const champs = ([0, 1] as const).map((c) => prev.find((s) => s.conference === c)?.winner ?? null);
      rounds.push([make(`${league.season}-r${r}-final`, r, null, champs[0], champs[1])]);
    } else {
      rounds.push(([0, 1] as const).flatMap((c) => {
        const mine = prev.filter((s) => s.conference === c);
        const out: Series[] = [];
        for (let i = 0; i < mine.length; i += 2) {
          out.push(make(`${league.season}-r${r}-c${c}-s${i / 2}`, r, c, mine[i].winner, mine[i + 1].winner));
        }
        return out;
      }));
    }
  }
  return rounds;
}

export const champion = (rounds: Series[][]) => rounds[rounds.length - 1][0].winner;

async function loadBracket(db: SaveDb, league: League) {
  const teams = await db.teams.where("leagueId").equals(league.id).toArray();
  const standings = await db.teamSeasons.where("[leagueId+season]").equals([league.id, league.season]).toArray();
  const games = (await db.games.where("[leagueId+season+status]").equals([league.id, league.season, "final"]).toArray())
    .filter((g) => g.isPlayoff);
  return { teams, standings, games, rounds: buildBracket(league, teams, standings, games) };
}

/** Plays one game in every live series of the current round per playoff day. */
export async function advancePlayoffs(
  db: SaveDb, league: League, until: AdvanceUntil,
  onProgress?: (p: { day: number; lastDay: number }) => void,
  shouldStop?: () => boolean,
): Promise<AdvanceResult> {
  const t0 = performance.now();
  const { simTeams, playerById } = await loadSimTeams(db, league.id);
  let day = league.day, gamesPlayed = 0, daysPlayed = 0;
  let eventPause: string | null = null;
  const maxDays = until === "day" ? 1 : until === "week" ? 7 : Infinity;

  while (daysPlayed < maxDays && !shouldStop?.()) {
    const { rounds, teams, standings } = await loadBracket(db, league);
    if (champion(rounds)) break;
    const current = rounds.find((r) => r.some((s) => !s.winner))!;
    const finished: Game[] = [];
    const lines: PlayerGameStat[] = [];
    const changed = new Set<string>();
    const events: GameEvent[] = [];
    for (const s of current) {
      if (s.winner || !s.top || !s.bottom) continue;
      const gameNo = s.winsTop + s.winsBottom + 1;
      const topHome = HOME_GAMES_FOR_TOP.has(gameNo);
      const homeId = topHome ? s.top : s.bottom, awayId = topHome ? s.bottom : s.top;
      const g: Game = {
        id: crypto.randomUUID(), leagueId: league.id, season: league.season, day,
        homeTeamId: homeId, awayTeamId: awayId, isPlayoff: 1, seriesId: s.id, status: "final",
        seed: `${league.seed}:playoffs:${league.season}:${s.id}:${gameNo}`,
        scoreHome: null, scoreAway: null, playByPlay: null,
      };
      const home = simTeams.get(homeId)!, away = simTeams.get(awayId)!;
      const r = simGame(home, away, g.seed);
      g.scoreHome = r.scoreHome;
      g.scoreAway = r.scoreAway;
      finished.push(g);
      lines.push(...statRows(league.id, league.season, g, home, away, r));
      applyInjuries([home, away], playerById, r, changed);
      const inj = injuryEvents(league, r, [home, away].find((t) => t.id === league.userTeamId), playerById);
      events.push(...inj.events);
      eventPause ??= inj.pause;
    }
    day++;
    await db.transaction("rw", [db.games, db.playerGameStats, db.leagues, db.players, db.events], async () => {
      await db.games.bulkAdd(finished);
      await db.playerGameStats.bulkAdd(lines);
      for (const id of changed) await db.players.update(id, { injury: playerById.get(id)!.injury });
      if (events.length) await db.events.bulkAdd(events);
      await db.leagues.update(league.id, { day, updatedAt: new Date().toISOString() });
    });
    league = { ...league, day };
    gamesPlayed += finished.length;
    daysPlayed++;
    onProgress?.({ day, lastDay: day });

    const after = await loadBracket(db, league);
    if (champion(after.rounds)) {
      await finishPlayoffs(db, league, after.rounds, teams, standings);
      break;
    }
    if (eventPause) break;
  }
  const { rounds } = await loadBracket(db, league);
  const over = !!champion(rounds);
  return {
    daysPlayed, gamesPlayed, day, phaseOver: over, ms: Math.round(performance.now() - t0),
    paused: eventPause && !over ? { reason: "event", message: eventPause } : undefined,
  };
}

/** Records how far every team went, writes season stats and awards. Runs once. */
async function finishPlayoffs(db: SaveDb, league: League, rounds: Series[][], teams: Team[], standings: TeamSeason[]) {
  const reached = new Map<string, number>();
  for (const round of rounds) for (const s of round) for (const t of [s.top, s.bottom]) if (t) reached.set(t, s.round);
  const champ = champion(rounds)!;
  const finals = rounds[rounds.length - 1][0];
  const updated = standings.map((ts): TeamSeason => {
    const r = reached.get(ts.teamId);
    if (r === undefined) return { ...ts, playoffResult: "missed", playoffRoundReached: null };
    const result = ts.teamId === champ ? "champion" : r === finals.round ? "finals" : "round";
    return { ...ts, playoffResult: result, playoffRoundReached: r };
  });
  const user = teams.find((t) => t.id === league.userTeamId)!;
  const champTeam = teams.find((t) => t.id === champ)!;
  const userResult = updated.find((u) => u.teamId === user.id)!;
  const awards = await computeAwards(db, league, teams, updated, champ, finals.id);

  await db.transaction("rw", [db.teamSeasons, db.awards, db.events, db.playerSeasonStats, db.playerGameStats, db.players], async () => {
    await db.teamSeasons.bulkPut(updated);
    await db.awards.bulkAdd(awards.awards);
    await db.playerSeasonStats.bulkAdd(awards.seasonStats);
    await db.events.add(newEvent(league, "award", {
      text: champ === user.id
        ? `🏆 ${user.city} ${user.name} 拿下 ${league.season} 年總冠軍！`
        : `${champTeam.city} ${champTeam.name} 拿下 ${league.season} 年總冠軍。${userResult.playoffResult === "missed" ? "你的球隊沒有打進季後賽。" : `你的球隊止步${roundName(userResult.playoffRoundReached!, league.settings.playoffTeams)}。`}`,
    }));
  });
}

export async function getBracket(db: SaveDb, league: League) {
  return (await loadBracket(db, league)).rounds;
}
