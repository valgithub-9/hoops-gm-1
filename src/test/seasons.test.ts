import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ACTIVE, FREE_AGENT, SaveDb } from "../db/schema";
import { advanceThrough, rotationProblems } from "../data/advance";
import { autoDraft, draftPlayer, draftState } from "../data/draft";
import { createLeague } from "../data/league";
import { nextPhase } from "../data/offseason";
import { champion, getBracket, bracketOrder } from "../data/playoffs";
import { exportLeague, importLeague } from "../data/saveFile";
import { saveRotation } from "../data/team";
import { deleteLeague } from "../data/league";
import { askFor, expiring, extendContract, signFreeAgent } from "../data/freeAgency";
import { payroll } from "../rules/cap";
import { autoRotation } from "../engine/sim";

const db = new SaveDb();

async function playSeason(leagueId: string, userPicks = false) {
  await advanceThrough(db, leagueId);
  expect(await nextPhase(db, leagueId)).toBe("playoffs");
  await advanceThrough(db, leagueId);
  let league = (await db.leagues.get(leagueId))!;
  expect(champion(await getBracket(db, league))).toBeTruthy();
  expect(await nextPhase(db, leagueId)).toBe("draft");
  if (userPicks) {
    await autoDraft(db, leagueId, "untilUser");
    league = (await db.leagues.get(leagueId))!;
    const { next, prospects } = await draftState(db, league);
    expect(next!.ownerTeamId).toBe(league.userTeamId);
    await expect(draftPlayer(db, leagueId, prospects[0].id)).resolves.toBeUndefined();
  }
  await autoDraft(db, leagueId, "all");

  // Act like a GM: extend the best expiring player during the offseason...
  league = (await db.leagues.get(leagueId))!;
  let contracts = await db.contracts.where("leagueId").equals(leagueId).toArray();
  let roster = await db.players.where("[leagueId+teamId]").equals([leagueId, league.userTeamId]).toArray();
  const best = expiring(contracts, roster, league.season).sort((a, b) => b.overall - a.overall)[0];
  if (best) expect((await extendContract(db, leagueId, best.id, askFor(best, league, 0.95))).accepted).toBe(true);

  expect(await nextPhase(db, leagueId)).toBe("regular");

  // ...then fill the roster from free agency before the new season can start.
  league = (await db.leagues.get(leagueId))!;
  roster = await db.players.where("[leagueId+teamId]").equals([leagueId, league.userTeamId]).toArray();
  if (best) expect(roster.some((p) => p.id === best.id)).toBe(true);
  const fas = (await db.players.where("[leagueId+teamId]").equals([leagueId, FREE_AGENT]).toArray())
    .filter((p) => !p.isProspect && p.retiredSeason === ACTIVE).sort((a, b) => b.overall - a.overall);
  for (const fa of fas) {
    if (roster.length >= league.settings.rosterMin) break;
    contracts = await db.contracts.where("leagueId").equals(leagueId).toArray();
    const room = league.settings.salaryCap - payroll(contracts, league.userTeamId, league.season);
    const ask = askFor(fa, league);
    if (ask.salary > room && ask.salary > league.settings.minSalary) continue; // cannot afford him
    expect((await signFreeAgent(db, leagueId, fa.id, ask)).accepted).toBe(true);
    roster = await db.players.where("[leagueId+teamId]").equals([leagueId, league.userTeamId]).toArray();
  }
  const team = (await db.teams.get(league.userTeamId))!;
  await saveRotation(db, leagueId, { ...autoRotation(roster), tactics: team.rotation.tactics });
}

describe("bracket", () => {
  it("seeds 1v8, 4v5, 2v7, 3v6", () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
  });
});

describe("eight seasons in a row (8 teams, 20 games)", () => {
  let id = "";
  const avgOvr: number[] = [];

  it("plays regular season, playoffs, draft and rollover each year", async () => {
    id = await createLeague(db, { name: "Dynasty", numTeams: 8, gamesPerSeason: 20, userTeamIndex: 2, difficulty: "normal", seed: "dyn" });
    for (let y = 0; y < 8; y++) {
      await playSeason(id, y === 0);
      const league = (await db.leagues.get(id))!;
      expect(league.season).toBe(2028 + y);
      expect(league.phase).toBe("regular");
      expect(league.day).toBe(0);
      const players = await db.players.where("leagueId").equals(id).toArray();
      const rostered = players.filter((p) => p.teamId !== FREE_AGENT && p.retiredSeason === ACTIVE);
      avgOvr.push(rostered.reduce((n, p) => n + p.overall, 0) / rostered.length);
    }
  }, 240_000);

  it("keeps every roster legal and every rostered player under contract", async () => {
    const league = (await db.leagues.get(id))!;
    const teams = await db.teams.where("leagueId").equals(id).toArray();
    const contracts = await db.contracts.where("leagueId").equals(id).toArray();
    for (const t of teams) {
      const roster = await db.players.where("[leagueId+teamId]").equals([id, t.id]).toArray();
      expect(roster.length).toBeGreaterThanOrEqual(league.settings.rosterMin);
      expect(roster.length).toBeLessThanOrEqual(league.settings.rosterMax);
      expect(rotationProblems(t.rotation, roster.map((p) => p.id), league.settings.rosterMin)).toEqual([]);
      if (!t.isUser) expect(payroll(contracts, t.id, league.season)).toBeLessThanOrEqual(league.settings.luxuryTax * 1.1);
      for (const p of roster) {
        expect(contracts.some((c) => c.playerId === p.id && c.teamId === t.id && c.startSeason <= league.season && c.endSeason >= league.season)).toBe(true);
      }
    }
  });

  it("writes awards, champions, rating history and retirements", async () => {
    const awards = await db.awards.where("leagueId").equals(id).toArray();
    expect(awards.filter((a) => a.type === "CHAMPION")).toHaveLength(8);
    expect(awards.filter((a) => a.type === "MVP")).toHaveLength(8);
    expect(awards.filter((a) => a.type === "ROY").length).toBeGreaterThanOrEqual(3); // first season has no rookies
    expect(await db.ratingHistory.where("leagueId").equals(id).count()).toBeGreaterThan(0);
    const retired = await db.players.where("leagueId").equals(id).filter((p) => p.retiredSeason !== ACTIVE).count();
    expect(retired).toBeGreaterThan(0);
  });

  it("archives box scores older than last season but keeps season totals", async () => {
    const league = (await db.leagues.get(id))!;
    const lines = await db.playerGameStats.where("leagueId").equals(id).toArray();
    expect(Math.min(...lines.map((l) => l.season))).toBe(league.season - 1);
    const totals = await db.playerSeasonStats.where("leagueId").equals(id).toArray();
    expect(new Set(totals.map((t) => t.season)).size).toBe(8);
  });

  it("does not drift: average overall stays within a few points", () => {
    console.log("avg rostered overall by season", avgOvr.map((x) => x.toFixed(1)).join(" "));
    expect(Math.max(...avgOvr) - Math.min(...avgOvr)).toBeLessThan(5);
  });

  it("rejects an illegal rotation and saves a legal one", async () => {
    const league = (await db.leagues.get(id))!;
    const team = (await db.teams.get(league.userTeamId))!;
    await expect(saveRotation(db, id, { ...team.rotation, starters: team.rotation.starters.slice(0, 4) })).rejects.toThrow(/先發/);
    const moved = { ...team.rotation, minutes: { ...team.rotation.minutes } };
    const [a, b] = team.rotation.starters;
    moved.minutes[a] -= 2; moved.minutes[b] += 2;
    await saveRotation(db, id, moved);
    expect((await db.teams.get(team.id))!.rotation.minutes[b]).toBe(team.rotation.minutes[b] + 2);
  });

});

describe("save files", () => {
  it("exports and imports a save, and refuses a duplicate or foreign file", async () => {
    const id = await createLeague(db, { name: "Export", numTeams: 4, gamesPerSeason: 6, userTeamIndex: 0, difficulty: "normal", seed: "exp" });
    await advanceThrough(db, id);
    const file = await exportLeague(db, id);
    const text = JSON.stringify(file);
    await expect(importLeague(db, text)).rejects.toThrow(/已經在/);
    await expect(importLeague(db, "{nope")).rejects.toThrow(/JSON/);
    await expect(importLeague(db, JSON.stringify({ format: "other" }))).rejects.toThrow(/不是/);
    const games = await db.games.where("leagueId").equals(id).count();
    await deleteLeague(db, id);
    expect(await importLeague(db, text)).toBe(id);
    expect(await db.games.where("leagueId").equals(id).count()).toBe(games);
  }, 60_000);
});
