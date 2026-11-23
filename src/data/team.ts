import type { Rotation, SaveDb } from "../db/schema";
import { autoRotation } from "../engine/sim";
import { rotationProblems } from "./advance";

/** Saves the user's rotation. Rules are checked here, not only in the form. */
export async function saveRotation(db: SaveDb, leagueId: string, rotation: Rotation) {
  const league = (await db.leagues.get(leagueId))!;
  const roster = await db.players.where("[leagueId+teamId]").equals([leagueId, league.userTeamId]).toArray();
  const problems = rotationProblems(rotation, roster.map((p) => p.id), league.settings.rosterMin);
  if (problems.length) throw new Error(problems.join("；"));
  const clean: Rotation = {
    starters: rotation.starters,
    minutes: Object.fromEntries(roster.map((p) => [p.id, rotation.minutes[p.id] ?? 0])),
    tactics: {
      pace: clampTactic(rotation.tactics.pace),
      threePointFocus: clampTactic(rotation.tactics.threePointFocus),
      defensePressure: clampTactic(rotation.tactics.defensePressure),
    },
  };
  await db.teams.update(league.userTeamId, { rotation: clean });
}

const clampTactic = (v: number) => Math.max(-2, Math.min(2, Math.round(v)));

export async function suggestedRotation(db: SaveDb, leagueId: string): Promise<Rotation> {
  const league = (await db.leagues.get(leagueId))!;
  const team = (await db.teams.get(league.userTeamId))!;
  const roster = await db.players.where("[leagueId+teamId]").equals([leagueId, team.id]).toArray();
  return { ...autoRotation(roster), tactics: team.rotation.tactics };
}
