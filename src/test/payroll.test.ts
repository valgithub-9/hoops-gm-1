import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { SaveDb } from "../db/schema";
import { createLeague } from "../data/league";
import { payroll } from "../rules/cap";

it("every team starts under the salary cap, with real spread between them", async () => {
  const db = new SaveDb();
  const id = await createLeague(db, { name: "P", numTeams: 30, gamesPerSeason: 82, userTeamIndex: 0, difficulty: "normal", seed: "pay" });
  const league = (await db.leagues.get(id))!;
  const contracts = await db.contracts.where("leagueId").equals(id).toArray();
  const teams = await db.teams.where("leagueId").equals(id).toArray();
  const pays = teams.map((t) => payroll(contracts, t.id, league.season)).sort((a, b) => a - b);
  expect(pays[pays.length - 1]).toBeLessThanOrEqual(league.settings.salaryCap);
  expect(pays[pays.length - 1] - pays[0]).toBeGreaterThan(20000); // some teams have room, some do not
}, 60_000);
