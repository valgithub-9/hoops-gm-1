import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { SaveDb } from "../db/schema";
import { createLeague, deleteLeague, previewTeams } from "../data/league";
import { advance } from "../data/advance";
import { simGame, autoRotation, type SimTeam } from "../engine/sim";
import { generatePlayer, POSITIONS } from "../engine/players";
import { makeRng } from "../engine/rng";
import { makeSchedule } from "../engine/schedule";

const db = new SaveDb();
let leagueId = "";

// fake-indexeddb gets slow as tables grow, so database behaviour is tested on
// a small league; realism and speed of the engine are tested in memory below,
// and real-browser speed in e2e.
const TEAMS = 8, GAMES = 20;

beforeAll(async () => {
  leagueId = await createLeague(db, { name: "Test", numTeams: TEAMS, gamesPerSeason: GAMES, userTeamIndex: 0, difficulty: "normal", seed: "test-seed" });
  const day = await advance(db, leagueId, "day");
  expect(day.gamesPlayed).toBe(TEAMS / 2);
  await advance(db, leagueId, "phaseEnd");
}, 60_000);

describe("a small league through a whole season (database)", () => {
  it("plays every game exactly once", async () => {
    const games = await db.games.where("leagueId").equals(leagueId).toArray();
    expect(games).toHaveLength((TEAMS * GAMES) / 2);
    expect(games.every((g) => g.status === "final" && g.scoreHome !== g.scoreAway)).toBe(true);
    const standings = await db.teamSeasons.where("leagueId").equals(leagueId).toArray();
    expect(standings.every((s) => s.wins + s.losses === GAMES)).toBe(true);
    const league = await db.leagues.get(leagueId);
    expect(league!.day).toBe(GAMES);
  });

  it("advancing again does nothing (idempotent)", async () => {
    const before = await db.playerGameStats.where("leagueId").equals(leagueId).count();
    const r = await advance(db, leagueId, "week");
    expect(r.gamesPlayed).toBe(0);
    expect(await db.playerGameStats.where("leagueId").equals(leagueId).count()).toBe(before);
  });

  it("deletes every row of a league", async () => {
    await deleteLeague(db, leagueId);
    for (const t of ["games", "players", "playerGameStats", "teamSeasons", "teams", "contracts"] as const) {
      expect(await db[t].where("leagueId").equals(leagueId).count()).toBe(0);
    }
  });
});

describe("a full 30-team, 82-game season in memory (engine)", () => {
  const rng = makeRng("realism");
  const teams: SimTeam[] = Array.from({ length: 30 }, (_, t) => {
    const offset = rng.normal(0, 2.5);
    const ps = [...POSITIONS, ...POSITIONS, ...Array.from({ length: 4 }, () => rng.pick(POSITIONS))]
      .map((pos, i) => ({ id: `t${t}p${i}`, ...generatePlayer(rng, pos, offset) }));
    const rot = autoRotation(ps);
    return { id: `t${t}`, tactics: rot.tactics, players: ps.map((p) => ({ id: p.id, ratings: p.ratings, overall: p.overall, minutes: rot.minutes[p.id], starter: rot.starters.includes(p.id) })) };
  });
  const schedule = makeSchedule(30, 82, makeRng("sched"));
  const wins = new Map<string, number>();
  const tot = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, reb: 0, ast: 0, min: 0 };
  const t0 = performance.now();
  schedule.forEach((g, i) => {
    const h = teams[g.home], a = teams[g.away];
    const r = simGame(h, a, `g${i}`);
    const w = r.scoreHome > r.scoreAway ? h : a;
    wins.set(w.id, (wins.get(w.id) ?? 0) + 1);
    for (const l of r.stats.values()) for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += l[k];
  });
  const ms = performance.now() - t0;
  const teamGames = schedule.length * 2;

  it("produces box scores that look like basketball", () => {
    const m = {
      ppg: tot.pts / teamGames, fgPct: tot.fgm / tot.fga, tpPct: tot.tpm / tot.tpa, ftPct: tot.ftm / tot.fta,
      tpa: tot.tpa / teamGames, fta: tot.fta / teamGames, tov: tot.tov / teamGames, reb: tot.reb / teamGames,
      ast: tot.ast / teamGames, min: tot.min / teamGames,
    };
    console.table(m);
    expect(m.ppg).toBeGreaterThan(100); expect(m.ppg).toBeLessThan(122);
    expect(m.fgPct).toBeGreaterThan(0.43); expect(m.fgPct).toBeLessThan(0.51);
    expect(m.tpPct).toBeGreaterThan(0.32); expect(m.tpPct).toBeLessThan(0.39);
    expect(m.ftPct).toBeGreaterThan(0.7); expect(m.ftPct).toBeLessThan(0.83);
    expect(m.tpa).toBeGreaterThan(25); expect(m.tpa).toBeLessThan(42);
    expect(m.fta).toBeGreaterThan(15); expect(m.fta).toBeLessThan(28);
    expect(m.tov).toBeGreaterThan(10); expect(m.tov).toBeLessThan(17);
    expect(m.reb).toBeGreaterThan(38); expect(m.reb).toBeLessThan(50);
    expect(m.ast).toBeGreaterThan(20); expect(m.ast).toBeLessThan(30);
    expect(m.min).toBeGreaterThanOrEqual(240); expect(m.min).toBeLessThan(245);
  });

  it("lets better teams win more", () => {
    const strength = (t: SimTeam) => t.players.reduce((n, p) => n + p.overall * p.minutes, 0) / 240;
    const xs = teams.map(strength), ys = teams.map((t) => wins.get(t.id) ?? 0);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    const cov = xs.reduce((n, x, i) => n + (x - mx) * (ys[i] - my), 0);
    const r = cov / Math.sqrt(xs.reduce((n, x) => n + (x - mx) ** 2, 0) * ys.reduce((n, y) => n + (y - my) ** 2, 0));
    const sorted = [...ys].sort((a, b) => b - a);
    console.log("strength-wins r", r.toFixed(2), "best", sorted[0], "worst", sorted[29]);
    expect(r).toBeGreaterThan(0.6);
    expect(sorted[0]).toBeGreaterThan(52);
    expect(sorted[29]).toBeLessThan(30);
  });

  it("simulates a season in well under a second", () => {
    expect(ms).toBeLessThan(2000);
  });
});

describe("determinism", () => {
  const team = (seed: string): SimTeam => {
    const rng = makeRng(seed);
    const players = Array.from({ length: 13 }, (_, i) => ({ id: `${seed}${i}`, ...generatePlayer(rng, POSITIONS[i % 5]) }));
    const rot = autoRotation(players);
    return { id: seed, tactics: rot.tactics, players: players.map((p) => ({ id: p.id, ratings: p.ratings, overall: p.overall, minutes: rot.minutes[p.id], starter: rot.starters.includes(p.id) })) };
  };
  it("same seed, same game", () => {
    const a = simGame(team("h"), team("a"), "g1"), b = simGame(team("h"), team("a"), "g1");
    expect([a.scoreHome, a.scoreAway]).toEqual([b.scoreHome, b.scoreAway]);
    expect([...a.stats.entries()]).toEqual([...b.stats.entries()]);
  });
  it("same seed, same teams", () => {
    expect(previewTeams("x", 30)).toEqual(previewTeams("x", 30));
    expect(new Set(previewTeams("x", 30).map((t) => t.abbrev)).size).toBe(30);
  });
});
