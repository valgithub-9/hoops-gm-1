import type { Contract, DraftPick, League, Player, SaveDb } from "../db/schema";
import { conferenceStandings } from "../lib/standings";
import { makeRng } from "../engine/rng";
import { fullName, newEvent } from "./season";
import { tr } from "../i18n";

/** Worst regular-season record picks first; round two repeats the order. */
export async function startDraft(db: SaveDb, league: League) {
  const teams = await db.teams.where("leagueId").equals(league.id).toArray();
  const standings = await db.teamSeasons.where("[leagueId+season]").equals([league.id, league.season]).toArray();
  const order = [...conferenceStandings(teams, standings, 0), ...conferenceStandings(teams, standings, 1)]
    .sort((a, b) => a.pct - b.pct || (a.ts.pointsFor - a.ts.pointsAgainst) - (b.ts.pointsFor - b.ts.pointsAgainst))
    .map((r) => r.team.id);
  const picks = await db.draftPicks.where("[leagueId+season]").equals([league.id, league.season]).toArray();
  for (const p of picks) p.pickNo = (p.round - 1) * order.length + order.indexOf(p.originalTeamId) + 1;
  const mine = picks.filter((p) => p.ownerTeamId === league.userTeamId).map((p) => tr(`第 ${p.pickNo} 順位`, `pick ${p.pickNo}`)).join(tr("、", ", "));
  await db.transaction("rw", [db.draftPicks, db.leagues, db.events], async () => {
    await db.draftPicks.bulkPut(picks);
    await db.leagues.update(league.id, { phase: "draft", updatedAt: new Date().toISOString() });
    await db.events.add(newEvent(league, "draft", { text: tr(`${league.season} 選秀開始。你持有${mine || "0 支籤"}。`, `The ${league.season} draft has started. You hold ${mine || "no picks"}.`) }));
  });
}

export async function draftState(db: SaveDb, league: League) {
  const picks = (await db.draftPicks.where("[leagueId+season]").equals([league.id, league.season]).toArray())
    .filter((p) => p.pickNo != null).sort((a, b) => a.pickNo! - b.pickNo!);
  const prospects = await db.players.where("[leagueId+isProspect]").equals([league.id, 1]).toArray();
  return { picks, prospects, next: picks.find((p) => !p.playerId) ?? null };
}

const rookieSalary = (pick: DraftPick, min: number) =>
  pick.round === 1 ? Math.round(Math.max(2000, 10000 - (pick.pickNo! - 1) * 280) / 100) * 100 : min;

/** Draft value as the AI sees it: today's level and upside, half each. */
const value = (p: Player) => p.overall * 0.5 + p.potential * 0.5;

async function makePick(db: SaveDb, league: League, pick: DraftPick, player: Player) {
  const contract: Contract = {
    id: crypto.randomUUID(), leagueId: league.id, playerId: player.id, teamId: pick.ownerTeamId,
    salaryPerYear: rookieSalary(pick, league.settings.minSalary),
    startSeason: league.season + 1, endSeason: league.season + (pick.round === 1 ? 3 : 2),
    type: pick.round === 1 ? "rookie" : "minimum", option: null,
  };
  await db.transaction("rw", [db.draftPicks, db.players, db.contracts, db.events], async () => {
    const fresh = await db.draftPicks.get(pick.id);
    if (fresh?.playerId) throw new Error(tr("這個順位已經選過了", "That pick has already been used"));
    await db.draftPicks.update(pick.id, { playerId: player.id });
    await db.players.update(player.id, {
      teamId: pick.ownerTeamId, isProspect: 0,
      draft: { season: league.season, round: pick.round, pick: pick.pickNo!, teamId: pick.ownerTeamId },
    });
    await db.contracts.add(contract);
    if (pick.ownerTeamId === league.userTeamId) {
      await db.events.add(newEvent(league, "draft", { text: tr(`你在第 ${pick.pickNo} 順位選了 ${fullName(player)}（${player.position}）。`, `You drafted ${fullName(player)} (${player.position}) with pick ${pick.pickNo}.`), playerId: player.id }));
    }
  });
}

/** The user's own pick. Only allowed when the user is on the clock. */
export async function draftPlayer(db: SaveDb, leagueId: string, playerId: string) {
  const league = (await db.leagues.get(leagueId))!;
  const { next } = await draftState(db, league);
  if (league.phase !== "draft" || !next) throw new Error(tr("現在不是選秀時間", "The draft is not on right now"));
  if (next.ownerTeamId !== league.userTeamId) throw new Error(tr("還沒輪到你", "It is not your pick yet"));
  const player = await db.players.get(playerId);
  if (!player || player.isProspect !== 1) throw new Error(tr("這位球員已經被選走了", "That player has already been drafted"));
  await makePick(db, league, next, player);
}

/** AI picks until the user is on the clock (or through the end, picking for the user too). */
export async function autoDraft(db: SaveDb, leagueId: string, mode: "untilUser" | "all") {
  const league = (await db.leagues.get(leagueId))!;
  if (league.phase !== "draft") return 0;
  const rng = makeRng(`${league.seed}:draft:${league.season}`);
  let made = 0;
  for (;;) {
    const { next, prospects } = await draftState(db, league);
    if (!next || prospects.length === 0) break;
    if (next.ownerTeamId === league.userTeamId && mode === "untilUser") break;
    // A little noise so the board is not perfectly predictable.
    const board = prospects.map((p) => ({ p, v: value(p) + rng.normal(0, 2.5) })).sort((a, b) => b.v - a.v);
    await makePick(db, league, next, board[0].p);
    made++;
  }
  return made;
}

export async function draftDone(db: SaveDb, league: League) {
  const { next, prospects } = await draftState(db, league);
  return !next || prospects.length === 0;
}

/** What the user sees about a prospect: a scouting range, never the true potential. */
export function scoutedPotential(p: Pick<Player, "potential" | "overall" | "portraitSeed">): [number, number] {
  const r = makeRng(`scout:${p.portraitSeed}`);
  const width = 6, offset = r.int(-3, 3);
  const mid = Math.max(p.overall, p.potential + offset);
  return [Math.max(p.overall, mid - width), Math.min(99, mid + width)];
}
