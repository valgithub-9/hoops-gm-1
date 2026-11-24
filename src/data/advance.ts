import type { SaveDb } from "../db/schema";
import { advanceRegular, type AdvanceResult, type AdvanceUntil } from "./league";
import { advancePlayoffs } from "./playoffs";
import { tr } from "../i18n";

/** One entry point for the "advance" button: plays games in whatever phase the league is in. */
export async function advance(
  db: SaveDb, leagueId: string, until: AdvanceUntil,
  onProgress?: (p: { day: number; lastDay: number }) => void,
  shouldStop?: () => boolean,
): Promise<AdvanceResult> {
  const league = await db.leagues.get(leagueId);
  if (!league) throw new Error(tr("找不到這個聯盟", "League not found"));
  const problems = await rosterProblems(db, leagueId);
  if (problems.length) throw new Error(problems[0]);
  if (league.phase === "regular") return advanceRegular(db, league, until, onProgress, shouldStop);
  if (league.phase === "playoffs") return advancePlayoffs(db, league, until, onProgress, shouldStop);
  return { daysPlayed: 0, gamesPlayed: 0, day: league.day, phaseOver: true, ms: 0 };
}

/** Keeps advancing through pauses (deadline, injuries) until the phase is over. For tests and "sim to end" tools. */
export async function advanceThrough(db: SaveDb, leagueId: string): Promise<number> {
  let pauses = 0;
  for (;;) {
    const r = await advance(db, leagueId, "phaseEnd");
    if (r.phaseOver || r.daysPlayed === 0) return pauses;
    pauses++;
  }
}

/** Why the user's team cannot play right now, in words. Empty when it can. */
export async function rosterProblems(db: SaveDb, leagueId: string): Promise<string[]> {
  const league = (await db.leagues.get(leagueId))!;
  const team = (await db.teams.get(league.userTeamId))!;
  const roster = await db.players.where("[leagueId+teamId]").equals([leagueId, team.id]).toArray();
  return rotationProblems(team.rotation, roster.map((p) => p.id), league.settings.rosterMin);
}

export function rotationProblems(
  rotation: { starters: string[]; minutes: Record<string, number> }, rosterIds: string[], rosterMin: number,
): string[] {
  const out: string[] = [];
  const ids = new Set(rosterIds);
  if (rosterIds.length < rosterMin) out.push(tr(`名單只有 ${rosterIds.length} 人，最少需要 ${rosterMin} 人`, `Roster has only ${rosterIds.length} players; you need at least ${rosterMin}`));
  const starters = rotation.starters.filter((id) => ids.has(id));
  if (starters.length !== 5) out.push(tr(`先發要剛好 5 人（目前 ${starters.length} 人）`, `Pick exactly 5 starters (now ${starters.length})`));
  const total = rosterIds.reduce((n, id) => n + (rotation.minutes[id] ?? 0), 0);
  if (total !== 240) out.push(tr(`上場時間總和要是 240 分鐘（目前 ${total}）`, `Minutes must add up to 240 (now ${total})`));
  for (const id of rosterIds) {
    const m = rotation.minutes[id] ?? 0;
    if (m < 0 || m > 48 || !Number.isInteger(m)) { out.push(tr("每人上場時間要是 0 到 48 的整數", "Each player's minutes must be a whole number from 0 to 48")); break; }
  }
  for (const id of starters) if ((rotation.minutes[id] ?? 0) < 1) { out.push(tr("先發球員至少要有上場時間", "Starters need some minutes")); break; }
  return out;
}
