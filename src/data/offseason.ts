import {
  ACTIVE, FREE_AGENT,
  type Contract, type GameEvent, type League, type Player, type RatingHistory, type SaveDb, type Team,
} from "../db/schema";
import { askingSalary, overall, RATING_KEYS } from "../engine/players";
import { clamp, makeRng, type Rng } from "../engine/rng";
import { autoRotation } from "../engine/sim";
import { lastRegularDay, MAX_SALARY } from "./league";
import { champion, getBracket } from "./playoffs";
import { draftDone, startDraft } from "./draft";
import { fullName, newEvent, seasonSetup } from "./season";

/**
 * Mean yearly change in ratings by age. It matches the slope of the age curve
 * players are generated with (engine/players.ts ageShift), so the league
 * neither inflates nor deflates over the years. The seasons test checks it.
 */
const ageDelta = (age: number) =>
  age <= 22 ? 1.8 : age <= 26 ? 1.3 : age <= 30 ? 0 : age <= 32 ? -1.8 : age <= 34 ? -2.4 : -3.2;

export function progressPlayer(p: Player, age: number, rng: Rng): Player {
  const base = ageDelta(age) + rng.normal(0, 1.8);
  const ratings = { ...p.ratings };
  for (const k of RATING_KEYS) {
    let d = base + rng.normal(0, 1.5);
    if (k === "athleticism" || k === "stamina") d += age >= 29 ? -1 : 0.5; // bodies age first
    if (k === "iq") d += age >= 29 ? 1 : 0.5; // understanding keeps improving
    ratings[k] = Math.round(clamp(ratings[k] + d, 15, 99));
  }
  let ovr = overall(p.position, ratings);
  if (ovr > p.potential && age < 27) {
    // Growth past the ceiling is rare: pull back toward it.
    const over = ovr - p.potential;
    for (const k of RATING_KEYS) ratings[k] = Math.round(clamp(ratings[k] - over * 0.6, 15, 99));
    ovr = overall(p.position, ratings);
  }
  const potential = age >= 27 ? ovr : Math.max(ovr, p.potential + Math.round(rng.normal(0, 1.5)));
  return { ...p, ratings, overall: ovr, potential };
}

const retires = (age: number, ovr: number, rng: Rng) =>
  age >= 38 || (age >= 35 && ovr < 58 && rng() < 0.7) || (age >= 33 && ovr < 48 && rng() < 0.6) || (age >= 31 && ovr < 40);

/**
 * End of the offseason. In one transaction:
 * rating history snapshot, growth and aging, retirements, expiring contracts
 * (re-sign or walk), undrafted prospects to free agency, roster limits,
 * new rotations, then the next season's schedule, standings, picks and class.
 *
 * v1 decides re-signings and roster fills for every team, including the user's,
 * until the free-agency screen exists. Every change to the user's team is in the inbox.
 */
export async function startNewSeason(db: SaveDb, leagueId: string) {
  const league = (await db.leagues.get(leagueId))!;
  if (league.phase !== "draft") throw new Error("要先完成選秀");
  const season = league.season;
  const next = season + 1;
  const rng = makeRng(`${league.seed}:offseason:${season}`);
  const teams = await db.teams.where("leagueId").equals(leagueId).toArray();
  const allPlayers = await db.players.where("leagueId").equals(leagueId).toArray();
  const contracts = await db.contracts.where("leagueId").equals(leagueId).toArray();
  const user = teams.find((t) => t.id === league.userTeamId)!;
  const events: GameEvent[] = [];
  const ev = (text: string, type: GameEvent["type"] = "contract") => events.push(newEvent({ ...league, season: next, day: 0 }, type, { text }));

  const history: RatingHistory[] = [];
  const players = new Map<string, Player>();
  const newContracts: Contract[] = [];
  const endedContracts: Contract[] = [];

  // 1. Growth, aging, retirement.
  for (const p of allPlayers) {
    if (p.retiredSeason !== ACTIVE) continue;
    history.push({ id: crypto.randomUUID(), leagueId, playerId: p.id, season, ratings: p.ratings, overall: p.overall });
    const wasProspect = p.isProspect === 1;
    const age = next - p.bornYear;
    let q = progressPlayer(p, age, rng);
    if (wasProspect) q = { ...q, isProspect: 0, teamId: FREE_AGENT }; // went undrafted
    if (!wasProspect && retires(age, q.overall, rng)) {
      q = { ...q, retiredSeason: season, teamId: FREE_AGENT };
      if (p.teamId === user.id) ev(`${fullName(p)}（${age - 1} 歲）宣布退休。`, "retirement");
      for (const c of contracts) if (c.playerId === p.id && c.endSeason >= next) endedContracts.push({ ...c, endSeason: season });
    }
    players.set(p.id, q);
  }

  // 2. Expiring contracts: teams keep players who are worth it and still in their plans.
  const rosterOf = (teamId: string) => [...players.values()].filter((p) => p.teamId === teamId && p.retiredSeason === ACTIVE);
  for (const c of contracts) {
    if (c.endSeason !== season) continue;
    const p = players.get(c.playerId);
    if (!p || p.retiredSeason !== ACTIVE || p.teamId !== c.teamId) continue;
    const roster = rosterOf(c.teamId).sort((a, b) => b.overall - a.overall);
    const rank = roster.findIndex((x) => x.id === p.id);
    const age = next - p.bornYear;
    const keep = rank < 9 && (age < 33 || p.overall >= 60) && rng() < 0.8;
    if (keep) {
      const years = clamp(Math.round(rng.normal(age < 28 ? 3 : 2, 1)), 1, league.settings.maxContractYears);
      const salary = askingSalary(p.overall, league.settings.minSalary, MAX_SALARY);
      newContracts.push({
        id: crypto.randomUUID(), leagueId, playerId: p.id, teamId: c.teamId, salaryPerYear: salary,
        startSeason: next, endSeason: season + years, type: p.overall < 48 ? "minimum" : "standard", option: null,
      });
      if (c.teamId === user.id) ev(`${fullName(p)} 續約 ${years} 年，每年 $${(salary / 1000).toFixed(1)}M。`);
    } else {
      players.set(p.id, { ...p, teamId: FREE_AGENT });
      if (c.teamId === user.id) ev(`${fullName(p)} 合約到期，離隊成為自由球員。`);
    }
  }

  // 3. Roster limits: release the weakest when over the max, sign the best free agents when under the min.
  const salaryOf = (id: string) => newContracts.find((c) => c.playerId === id && c.endSeason >= next)
    ?? contracts.find((c) => c.playerId === id && c.endSeason >= next && !endedContracts.some((e) => e.id === c.id));
  for (const t of teams) {
    const roster = rosterOf(t.id).sort((a, b) => a.overall + a.potential * 0.3 - (b.overall + b.potential * 0.3));
    while (roster.length > league.settings.rosterMax) {
      const cut = roster.shift()!;
      players.set(cut.id, { ...cut, teamId: FREE_AGENT });
      const c = salaryOf(cut.id);
      if (c) endedContracts.push({ ...c, endSeason: season });
      if (t.id === user.id) ev(`名單超過 ${league.settings.rosterMax} 人，${fullName(cut)} 被釋出。`);
    }
  }
  const freeAgents = () => [...players.values()]
    .filter((p) => p.teamId === FREE_AGENT && p.retiredSeason === ACTIVE && p.isProspect === 0)
    .sort((a, b) => b.overall - a.overall);
  for (const t of rng.shuffle([...teams])) {
    while (rosterOf(t.id).length < league.settings.rosterMin) {
      const fa = freeAgents()[0];
      if (!fa) break;
      const salary = askingSalary(fa.overall, league.settings.minSalary, MAX_SALARY);
      players.set(fa.id, { ...fa, teamId: t.id });
      newContracts.push({
        id: crypto.randomUUID(), leagueId, playerId: fa.id, teamId: t.id, salaryPerYear: salary,
        startSeason: next, endSeason: next, type: salary <= league.settings.minSalary ? "minimum" : "standard", option: null,
      });
      if (t.id === user.id) ev(`名單不足 ${league.settings.rosterMin} 人，簽下自由球員 ${fullName(fa)}（總評 ${fa.overall}）一年約。`);
    }
  }

  // 3b. The free-agent pool stays about three deep per team: the rest leave the league.
  // Without this the pool grows every year and teams skim an ever larger talent pool.
  const pool = freeAgents().sort((a, b) => (b.overall + b.potential * 0.5) - (a.overall + a.potential * 0.5));
  for (const p of pool.slice(league.settings.numTeams * 3)) players.set(p.id, { ...p, retiredSeason: season });

  // 4. Rotations for the new rosters. The user's tactics are kept.
  const newTeams: Team[] = teams.map((t) => {
    const rot = autoRotation(rosterOf(t.id));
    return { ...t, rotation: t.id === user.id ? { ...rot, tactics: t.rotation.tactics } : rot };
  });
  if (rosterOf(user.id).length) ev("新球季的輪替已依總評自動重排，可以到「輪替」調整。", "milestone");

  // 5. Next season.
  const setup = seasonSetup(league, next, newTeams);
  await db.transaction("rw",
    [db.leagues, db.teams, db.players, db.contracts, db.ratingHistory, db.games, db.teamSeasons, db.draftPicks, db.events],
    async () => {
      await db.ratingHistory.bulkAdd(history);
      await db.players.bulkPut([...players.values(), ...setup.prospects]);
      await db.contracts.bulkPut([...endedContracts, ...newContracts]);
      await db.teams.bulkPut(newTeams);
      await db.games.bulkAdd(setup.games);
      await db.teamSeasons.bulkAdd(setup.teamSeasons);
      await db.draftPicks.bulkAdd(setup.picks);
      await db.events.bulkAdd(events);
      await db.leagues.update(leagueId, { season: next, phase: "regular", day: 0, updatedAt: new Date().toISOString() });
    });
  return { season: next, events: events.length };
}

/** Moves to the next phase when the current one is finished. */
export async function nextPhase(db: SaveDb, leagueId: string) {
  const league: League = (await db.leagues.get(leagueId))!;
  if (league.phase === "regular") {
    if (league.day <= (await lastRegularDay(db, league))) throw new Error("例行賽還沒打完");
    await db.transaction("rw", [db.leagues, db.events], async () => {
      await db.leagues.update(leagueId, { phase: "playoffs", updatedAt: new Date().toISOString() });
      await db.events.add(newEvent(league, "milestone", { text: `${league.season} 季後賽開打。` }));
    });
    return "playoffs";
  }
  if (league.phase === "playoffs") {
    if (!champion(await getBracket(db, league))) throw new Error("季後賽還沒打完");
    await startDraft(db, league);
    return "draft";
  }
  if (league.phase === "draft") {
    if (!(await draftDone(db, league))) throw new Error("選秀還沒結束");
    await startNewSeason(db, leagueId);
    return "regular";
  }
  throw new Error(`未知的階段：${league.phase}`);
}
