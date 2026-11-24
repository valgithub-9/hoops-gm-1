import { ACTIVE, FREE_AGENT, type Contract, type League, type Player, type SaveDb } from "../db/schema";
import { askingSalary } from "../engine/players";
import { clamp, makeRng } from "../engine/rng";
import { autoRotation } from "../engine/sim";
import { currentContract, fmtMoney, payroll, signingProblems, signingWindow } from "../rules/cap";
import { MAX_SALARY } from "./league";
import { fullName, newEvent } from "./season";
import { capSeason } from "./trade";
import { tr } from "../i18n";

export interface Ask { salary: number; years: number }

/** What a player wants. Stable for a season: the same player asks the same thing until next year. */
export function askFor(p: Player, league: Pick<League, "seed" | "season" | "settings">, discount = 1): Ask {
  const r = makeRng(`${league.seed}:ask:${league.season}:${p.id}`);
  const age = league.season + 1 - p.bornYear;
  const mood = 0.92 + r() * 0.2; // some players want more than others
  const base = askingSalary(p.overall, league.settings.minSalary, MAX_SALARY);
  // Minimum-level players take the minimum: a team over the cap must always be able to fill its roster.
  const salary = base <= league.settings.minSalary ? base : Math.round((base * mood * discount) / 100) * 100;
  const years = clamp(age <= 25 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1, 1, league.settings.maxContractYears);
  return { salary: Math.max(league.settings.minSalary, Math.min(MAX_SALARY, salary)), years };
}

/** Will the player take this offer? Far from the years he wants costs extra. */
export function judgeOffer(ask: Ask, offer: Ask): { accepted: boolean; reason: string } {
  const yearsOff = Math.abs(offer.years - ask.years);
  const needed = Math.round((ask.salary * (1 + Math.max(0, yearsOff - 1) * 0.08)) / 100) * 100;
  if (offer.salary >= needed) return { accepted: true, reason: tr("成交！", "Deal!") };
  return {
    accepted: false,
    reason: yearsOff > 1
      ? tr(`他想簽 ${ask.years} 年左右；簽 ${offer.years} 年的話，每年至少要 ${fmtMoney(needed)}。`, `He wants about ${ask.years} years; for ${offer.years} years he needs at least ${fmtMoney(needed)} a year.`)
      : tr(`他想要每年至少 ${fmtMoney(needed)}。`, `He wants at least ${fmtMoney(needed)} a year.`),
  };
}

async function userTeamState(db: SaveDb, leagueId: string) {
  const league = (await db.leagues.get(leagueId))!;
  const contracts = await db.contracts.where("leagueId").equals(leagueId).toArray();
  const roster = await db.players.where("[leagueId+teamId]").equals([leagueId, league.userTeamId]).toArray();
  return { league, contracts, roster };
}

/** Sign a free agent. Starts now in the season, or next season once this one is over. */
export async function signFreeAgent(db: SaveDb, leagueId: string, playerId: string, offer: Ask) {
  const { league, contracts, roster } = await userTeamState(db, leagueId);
  const window = signingWindow(league);
  if (window) throw new Error(window);
  const p = await db.players.get(playerId);
  if (!p || p.teamId !== FREE_AGENT || p.isProspect || p.retiredSeason !== ACTIVE) throw new Error(tr("這位球員已經不是自由球員了", "That player is no longer a free agent"));
  validateOffer(league, offer);
  const season = capSeason(league);
  const problems = signingProblems(payroll(contracts, league.userTeamId, season), offer.salary, roster.length, league);
  if (problems.length) throw new Error(problems[0]);
  const verdict = judgeOffer(askFor(p, league), offer);
  if (!verdict.accepted) return verdict;

  const contract: Contract = {
    id: crypto.randomUUID(), leagueId, playerId, teamId: league.userTeamId, salaryPerYear: offer.salary,
    startSeason: season, endSeason: season + offer.years - 1,
    type: offer.salary <= league.settings.minSalary ? "minimum" : "standard", option: null,
  };
  const team = (await db.teams.get(league.userTeamId))!;
  const rotation = team.rotation.minutes[playerId] === undefined ? { ...team.rotation, minutes: { ...team.rotation.minutes, [playerId]: 0 } } : team.rotation;
  await db.transaction("rw", [db.players, db.contracts, db.teams, db.events], async () => {
    const fresh = await db.players.get(playerId);
    if (fresh?.teamId !== FREE_AGENT) throw new Error(tr("這位球員剛剛被簽走了", "That player was just signed by someone else"));
    await db.players.update(playerId, { teamId: league.userTeamId });
    await db.contracts.add(contract);
    await db.teams.update(team.id, { rotation });
    await db.events.add(newEvent(league, "contract", {
      text: tr(`簽下 ${fullName(p)}：${offer.years} 年，每年 ${fmtMoney(offer.salary)}。到「輪替」安排他的上場時間。`, `Signed ${fullName(p)}: ${offer.years} years at ${fmtMoney(offer.salary)} a year. Give him minutes in Rotation.`),
    }));
  });
  return verdict;
}

/** Players whose deal ends this season and who could be extended now. */
export function expiring(contracts: Contract[], roster: Player[], season: number) {
  return roster.filter((p) => {
    const c = currentContract(contracts, p.id, season);
    return c && c.endSeason === season && !contracts.some((x) => x.playerId === p.id && x.type !== "released" && x.startSeason > season);
  });
}

/** Extend one of your own players before his deal runs out. Allowed over the cap; he asks a little less. */
export async function extendContract(db: SaveDb, leagueId: string, playerId: string, offer: Ask) {
  const { league, contracts, roster } = await userTeamState(db, leagueId);
  if (league.phase === "playoffs") throw new Error(tr("季後賽期間不能續約", "No extensions during the playoffs"));
  const p = roster.find((x) => x.id === playerId);
  if (!p || !expiring(contracts, roster, league.season).some((x) => x.id === playerId)) throw new Error(tr("這位球員現在不能續約", "That player cannot be extended right now"));
  validateOffer(league, offer);
  const verdict = judgeOffer(askFor(p, league, 0.95), offer);
  if (!verdict.accepted) return verdict;
  await db.transaction("rw", [db.contracts, db.events], async () => {
    await db.contracts.add({
      id: crypto.randomUUID(), leagueId, playerId, teamId: league.userTeamId, salaryPerYear: offer.salary,
      startSeason: league.season + 1, endSeason: league.season + offer.years,
      type: offer.salary <= league.settings.minSalary ? "minimum" : "standard", option: null,
    });
    await db.events.add(newEvent(league, "contract", { text: tr(`${fullName(p)} 續約 ${offer.years} 年，每年 ${fmtMoney(offer.salary)}。`, `${fullName(p)} extended for ${offer.years} years at ${fmtMoney(offer.salary)} a year.`) }));
  });
  return verdict;
}

/** Release a player. The team still pays the rest of his contract. */
export async function releasePlayer(db: SaveDb, leagueId: string, playerId: string) {
  const { league, contracts, roster } = await userTeamState(db, leagueId);
  if (league.phase === "playoffs") throw new Error(tr("季後賽期間不能釋出球員", "No releases during the playoffs"));
  const p = roster.find((x) => x.id === playerId);
  if (!p) throw new Error(tr("這位球員不在你的名單上", "That player is not on your roster"));
  const owed = contracts.filter((c) => c.playerId === playerId && c.teamId === league.userTeamId && c.type !== "released" && c.endSeason >= league.season);
  const team = (await db.teams.get(league.userTeamId))!;
  const left = roster.filter((x) => x.id !== playerId);
  await db.transaction("rw", [db.players, db.contracts, db.teams, db.events], async () => {
    await db.players.update(playerId, { teamId: FREE_AGENT });
    await db.contracts.bulkPut(owed.map((c) => ({ ...c, type: "released" as const })));
    await db.teams.update(team.id, { rotation: { ...autoRotation(left), tactics: team.rotation.tactics } });
    await db.events.add(newEvent(league, "contract", {
      text: tr(`釋出 ${fullName(p)}。剩下的合約（${owed.map((c) => `${fmtMoney(c.salaryPerYear)} 到 ${c.endSeason} 年`).join("、") || "無"}）仍算在薪資裡。輪替已自動重排。`,
      `Released ${fullName(p)}. The rest of his contract (${owed.map((c) => `${fmtMoney(c.salaryPerYear)} through ${c.endSeason}`).join(", ") || "none"}) still counts against your payroll. Rotation was redone automatically.`),
    }));
  });
}

function validateOffer(league: League, offer: Ask) {
  if (!Number.isInteger(offer.years) || offer.years < 1 || offer.years > league.settings.maxContractYears) {
    throw new Error(tr(`合約年數要在 1 到 ${league.settings.maxContractYears} 年之間`, `Contract length must be 1 to ${league.settings.maxContractYears} years`));
  }
  if (!Number.isFinite(offer.salary) || offer.salary < league.settings.minSalary || offer.salary > MAX_SALARY) {
    throw new Error(tr(`年薪要在 ${fmtMoney(league.settings.minSalary)} 到 ${fmtMoney(MAX_SALARY)} 之間`, `Salary must be between ${fmtMoney(league.settings.minSalary)} and ${fmtMoney(MAX_SALARY)}`));
  }
}
