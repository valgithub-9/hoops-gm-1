import {
  ACTIVE, FREE_AGENT,
  type Contract, type GameEvent, type League, type Player, type RatingHistory, type SaveDb, type Team,
} from "../db/schema";
import { askingSalary, generatePlayer, overall, POSITIONS, RATING_KEYS } from "../engine/players";
import { clamp, makeRng, type Rng } from "../engine/rng";
import { autoRotation } from "../engine/sim";
import { lastRegularDay, MAX_SALARY } from "./league";
import { champion, getBracket } from "./playoffs";
import { draftDone, startDraft } from "./draft";
import { fullName, newEvent, seasonSetup } from "./season";
import { tr } from "../i18n";

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
  if (league.phase !== "draft") throw new Error(tr("要先完成選秀", "Finish the draft first"));
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
    let q: Player = { ...progressPlayer(p, age, rng), injury: null }; // everyone heals over the summer
    if (wasProspect) q = { ...q, isProspect: 0, teamId: FREE_AGENT }; // went undrafted
    if (!wasProspect && retires(age, q.overall, rng)) {
      q = { ...q, retiredSeason: season, teamId: FREE_AGENT };
      if (p.teamId === user.id) ev(tr(`${fullName(p)}（${age - 1} 歲）宣布退休。`, `${fullName(p)} (age ${age - 1}) has retired.`), "retirement");
      for (const c of contracts) if (c.playerId === p.id && c.endSeason >= next) endedContracts.push({ ...c, endSeason: season });
    }
    players.set(p.id, q);
  }

  // 2. Expiring contracts: teams keep players who are worth it and still in their plans.
  const rosterOf = (teamId: string) => [...players.values()].filter((p) => p.teamId === teamId && p.retiredSeason === ACTIVE);
  // The user's own players are never decided here: extend them in free agency before the season ends,
  // or they leave. AI teams decide for themselves.
  const leftUser = new Set<string>();
  /** Next season's payroll for a team, counting decisions made so far this offseason. */
  const nextPayroll = (teamId: string) =>
    [...contracts.filter((c) => !endedContracts.some((e) => e.id === c.id)), ...newContracts]
      .filter((c) => c.teamId === teamId && c.startSeason <= next && c.endSeason >= next)
      .reduce((n, c) => n + c.salaryPerYear, 0);
  const extended = new Set(contracts.filter((c) => c.type !== "released" && c.startSeason > season).map((c) => c.playerId));
  for (const c of contracts) {
    if (c.endSeason !== season || c.type === "released") continue;
    const p = players.get(c.playerId);
    if (!p || p.retiredSeason !== ACTIVE || p.teamId !== c.teamId || extended.has(p.id)) continue;
    if (c.teamId === user.id) {
      players.set(p.id, { ...p, teamId: FREE_AGENT });
      leftUser.add(p.id);
      ev(tr(`${fullName(p)} 合約到期沒有續約，成為自由球員。想留他的話可以到自由市場把他簽回來。`, `${fullName(p)}'s contract ran out without an extension, so he is a free agent. Sign him back in Free Agency if you want to keep him.`));
      continue;
    }
    const roster = rosterOf(c.teamId).sort((a, b) => b.overall - a.overall);
    const rank = roster.findIndex((x) => x.id === p.id);
    const age = next - p.bornYear;
    const salary = askingSalary(p.overall, league.settings.minSalary, MAX_SALARY);
    // AI teams may re-sign over the cap, but not past the luxury-tax line.
    const affordable = nextPayroll(c.teamId) + salary <= league.settings.luxuryTax;
    const keep = rank < 9 && (age < 33 || p.overall >= 60) && affordable && rng() < 0.8;
    if (keep) {
      const years = clamp(Math.round(rng.normal(age < 28 ? 3 : 2, 1)), 1, league.settings.maxContractYears);
      newContracts.push({
        id: crypto.randomUUID(), leagueId, playerId: p.id, teamId: c.teamId, salaryPerYear: salary,
        startSeason: next, endSeason: season + years, type: p.overall < 48 ? "minimum" : "standard", option: null,
      });
    } else {
      players.set(p.id, { ...p, teamId: FREE_AGENT });
    }
  }

  // 3. Roster limits: release the weakest when over the max, sign the best free agents when under the min.
  const salaryOf = (id: string) => newContracts.find((c) => c.playerId === id && c.endSeason >= next)
    ?? contracts.find((c) => c.playerId === id && c.type !== "released" && c.endSeason >= next && !endedContracts.some((e) => e.id === c.id));
  for (const t of teams) {
    const roster = rosterOf(t.id).sort((a, b) => a.overall + a.potential * 0.3 - (b.overall + b.potential * 0.3));
    while (roster.length > league.settings.rosterMax) {
      const cut = roster.shift()!;
      players.set(cut.id, { ...cut, teamId: FREE_AGENT });
      const c = salaryOf(cut.id);
      if (c) endedContracts.push({ ...c, endSeason: season });
      if (t.id === user.id) ev(tr(`名單超過 ${league.settings.rosterMax} 人，${fullName(cut)} 被釋出。`, `Roster was over ${league.settings.rosterMax}, so ${fullName(cut)} was released.`));
    }
  }
  const freeAgents = () => [...players.values()]
    .filter((p) => p.teamId === FREE_AGENT && p.retiredSeason === ACTIVE && p.isProspect === 0)
    .sort((a, b) => b.overall - a.overall);
  for (const t of rng.shuffle([...teams])) {
    if (t.id === user.id) continue; // the user fills their own roster in free agency
    while (rosterOf(t.id).length < league.settings.rosterMin) {
      const fa = freeAgents()[0];
      if (!fa) break;
      const salary = askingSalary(fa.overall, league.settings.minSalary, MAX_SALARY);
      players.set(fa.id, { ...fa, teamId: t.id });
      newContracts.push({
        id: crypto.randomUUID(), leagueId, playerId: fa.id, teamId: t.id, salaryPerYear: salary,
        startSeason: next, endSeason: next, type: salary <= league.settings.minSalary ? "minimum" : "standard", option: null,
      });
    }
  }

  // 3b. The free-agent pool stays about three deep per team: the rest leave the league.
  // Without this the pool grows every year and teams skim an ever larger talent pool.
  const pool = freeAgents().sort((a, b) => (b.overall + b.potential * 0.5) - (a.overall + a.potential * 0.5));
  // Players who just left the user's team stay one more year, so they can be signed back.
  for (const p of pool.slice(league.settings.numTeams * 3)) if (!leftUser.has(p.id)) players.set(p.id, { ...p, retiredSeason: season });
  // There must always be enough minimum-salary depth players: a team over the cap can only sign those.
  const minPlayers = freeAgents().filter((p) => askingSalary(p.overall, league.settings.minSalary, MAX_SALARY) <= league.settings.minSalary);
  for (let i = minPlayers.length; i < league.settings.numTeams + 5; i++) {
    const g = generatePlayer(rng, rng.pick(POSITIONS), -14, rng.int(23, 31));
    const id = crypto.randomUUID();
    players.set(id, {
      id, leagueId, teamId: FREE_AGENT, firstName: g.firstName, lastName: g.lastName, bornYear: next - g.age,
      position: g.position, heightCm: g.heightCm, ratings: g.ratings, overall: g.overall, potential: g.overall,
      injury: null, draft: null, isProspect: 0, retiredSeason: ACTIVE, portraitSeed: g.portraitSeed,
    });
  }
  const short = league.settings.rosterMin - rosterOf(user.id).length;
  if (short > 0) ev(tr(`名單只有 ${rosterOf(user.id).length} 人，還差 ${short} 人才能開賽。到「自由市場」補人。`, `Your roster has ${rosterOf(user.id).length} players; you need ${short} more before the season can start. Sign them in Free Agency.`), "milestone");

  // 4. Rotations for the new rosters. The user's tactics are kept.
  const newTeams: Team[] = teams.map((t) => {
    const rot = autoRotation(rosterOf(t.id));
    return { ...t, rotation: t.id === user.id ? { ...rot, tactics: t.rotation.tactics } : rot };
  });
  if (rosterOf(user.id).length) ev(tr("新球季的輪替已依總評自動重排，可以到「輪替」調整。", "Your rotation for the new season was set by overall rating. Adjust it in Rotation."), "milestone");

  // 5. Next season.
  const existingPicks = await db.draftPicks.where("leagueId").equals(leagueId).toArray();
  const setup = seasonSetup(league, next, newTeams, existingPicks);
  // Box scores are kept for the last `keepPlayByPlaySeasons` seasons; older ones live on as season totals.
  const dropBefore = next - league.settings.keepPlayByPlaySeasons + 1;
  await db.transaction("rw",
    [db.leagues, db.teams, db.players, db.contracts, db.ratingHistory, db.games, db.teamSeasons, db.draftPicks, db.events, db.playerGameStats],
    async () => {
      await db.playerGameStats.where("[leagueId+season]").between([leagueId, 0], [leagueId, dropBefore], true, false).delete();
      await db.games.where("leagueId").equals(leagueId).filter((g) => g.season < dropBefore && g.playByPlay !== null)
        .modify((g) => { g.playByPlay = null; });
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
    if (league.day <= (await lastRegularDay(db, league))) throw new Error(tr("例行賽還沒打完", "The regular season is not over yet"));
    await db.transaction("rw", [db.leagues, db.events], async () => {
      await db.leagues.update(leagueId, { phase: "playoffs", updatedAt: new Date().toISOString() });
      await db.events.add(newEvent(league, "milestone", { text: tr(`${league.season} 季後賽開打。`, `The ${league.season} playoffs have started.`) }));
    });
    return "playoffs";
  }
  if (league.phase === "playoffs") {
    if (!champion(await getBracket(db, league))) throw new Error(tr("季後賽還沒打完", "The playoffs are not over yet"));
    await startDraft(db, league);
    return "draft";
  }
  if (league.phase === "draft") {
    if (!(await draftDone(db, league))) throw new Error(tr("選秀還沒結束", "The draft is not finished yet"));
    await startNewSeason(db, leagueId);
    return "regular";
  }
  throw new Error(tr(`未知的階段：${league.phase}`, `Unknown phase: ${league.phase}`));
}
