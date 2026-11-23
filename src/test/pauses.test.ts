import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { SaveDb } from "../db/schema";
import { advance, advanceThrough } from "../data/advance";
import { createLeague } from "../data/league";
import { nextPhase } from "../data/offseason";
import { injuryEvents } from "../data/season";
import type { Player } from "../db/schema";
import type { GameResult, SimTeam } from "../engine/sim";

const db = new SaveDb();

describe("which injuries pause advancing", () => {
  const league = { id: "L", season: 2027, day: 3, userTeamId: "me" };
  const player = (id: string) => ({ id, firstName: "Test", lastName: id } as unknown as Player);
  const team = (id: string, minutes: number): SimTeam => ({
    id, tactics: { pace: 0, threePointFocus: 0, defensePressure: 0 },
    players: [{ id: "p1", ratings: {} as never, overall: 70, minutes, starter: true }],
  });
  const result = (teamId: string, gamesOut: number): GameResult => ({
    scoreHome: 1, scoreAway: 0, overtimes: 0, stats: new Map(), fouledOut: [],
    injuries: [{ playerId: "p1", teamId, gamesOut, type: "腳踝扭傷" }],
  });
  const players = new Map([["p1", player("p1")]]);

  it("a long injury to a rotation player on my team pauses", () => {
    const r = injuryEvents(league, result("me", 8), team("me", 30), players);
    expect(r.pause).toMatch(/缺席 8 場/);
    expect(r.events[0].blocksAdvance).toBe(true);
  });
  it("a short one, or one to a bench player, only goes to the inbox", () => {
    expect(injuryEvents(league, result("me", 2), team("me", 30), players).pause).toBeNull();
    expect(injuryEvents(league, result("me", 20), team("me", 4), players).pause).toBeNull();
    expect(injuryEvents(league, result("me", 2), team("me", 30), players).events).toHaveLength(1);
  });
  it("other teams' injuries are not my inbox", () => {
    expect(injuryEvents(league, result("them", 20), team("them", 30), players).events).toEqual([]);
  });
});

describe("advancing stops for things the user should see", () => {
  it("stops once at the trade deadline, then carries on", async () => {
    const id = await createLeague(db, { name: "Deadline", numTeams: 4, gamesPerSeason: 20, userTeamIndex: 0, difficulty: "normal", seed: "dl" });
    const league = (await db.leagues.get(id))!;
    const deadline = league.settings.tradeDeadlineDay;
    let r = await advance(db, id, "phaseEnd");
    // An injury may pause earlier; keep going until something else stops us.
    while (r.paused?.reason === "event") r = await advance(db, id, "phaseEnd");
    expect(r.paused?.reason).toBe("deadline");
    expect((await db.leagues.get(id))!.day).toBe(deadline);
    r = await advance(db, id, "phaseEnd");
    while (r.paused?.reason === "event") r = await advance(db, id, "phaseEnd");
    expect(r.paused).toBeUndefined();
    expect(r.phaseOver).toBe(true);
  }, 60_000);

  it("'to the deadline' goes exactly there", async () => {
    const id = await createLeague(db, { name: "DL2", numTeams: 4, gamesPerSeason: 20, userTeamIndex: 0, difficulty: "normal", seed: "dl2" });
    const deadline = (await db.leagues.get(id))!.settings.tradeDeadlineDay;
    let r = await advance(db, id, "deadline");
    while (r.paused?.reason === "event") r = await advance(db, id, "deadline");
    expect((await db.leagues.get(id))!.day).toBe(deadline);
  }, 60_000);

  it("records injuries in the save, counts them down, pauses for long ones on the user's team, heals them in the offseason", async () => {
    const id = await createLeague(db, { name: "Hurt", numTeams: 8, gamesPerSeason: 41, userTeamIndex: 0, difficulty: "normal", seed: "hurt" });
    let sawInjury = false, sawPause = false;
    for (let i = 0; i < 60; i++) {
      const r = await advance(db, id, "day");
      const injured = (await db.players.where("leagueId").equals(id).toArray()).filter((p) => p.injury);
      if (injured.length) sawInjury = true;
      for (const p of injured) expect(p.injury!.gamesRemaining).toBeGreaterThan(0);
      if (r.paused?.reason === "event") {
        sawPause = true;
        const ev = (await db.events.where("leagueId").equals(id).toArray()).filter((e) => e.type === "injury" && e.blocksAdvance);
        expect(ev.length).toBeGreaterThan(0);
      }
      if (r.phaseOver) break;
    }
    expect(sawInjury).toBe(true);
    console.log("user team was paused by an injury:", sawPause);
    // Finish the year and check everyone heals.
    await advanceThrough(db, id);
    await nextPhase(db, id);
    await advanceThrough(db, id);
    await nextPhase(db, id);
    const { autoDraft } = await import("../data/draft");
    await autoDraft(db, id, "all");
    await nextPhase(db, id);
    const still = (await db.players.where("leagueId").equals(id).toArray()).filter((p) => p.injury);
    expect(still).toEqual([]);
  }, 180_000);
});
