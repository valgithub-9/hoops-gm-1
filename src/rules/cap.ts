// Salary-cap and roster rules. Pure functions: the screens use them to explain,
// the data layer uses them to enforce. A simplified, original rule set.
import type { Contract, League } from "../db/schema";
import { tr } from "../i18n";

/** Salary matching: a team over the cap after a trade may take back at most this much of what it sends, plus a little. */
export const TRADE_MATCH_RATIO = 1.25;
export const TRADE_MATCH_CUSHION = 100; // thousands

/** Contracts that count against a team's cap in a season (including players it released). */
export const activeContracts = (contracts: Contract[], teamId: string, season: number) =>
  contracts.filter((c) => c.teamId === teamId && c.startSeason <= season && c.endSeason >= season);

export const payroll = (contracts: Contract[], teamId: string, season: number) =>
  activeContracts(contracts, teamId, season).reduce((n, c) => n + c.salaryPerYear, 0);

/** The contract a player is playing under (never a released one). */
export const currentContract = (contracts: Contract[], playerId: string, season: number) =>
  contracts.find((c) => c.playerId === playerId && c.type !== "released" && c.startSeason <= season && c.endSeason >= season)
  ?? contracts.find((c) => c.playerId === playerId && c.type !== "released" && c.startSeason > season);

/** Trades are open in the regular season before the deadline, and in the offseason (draft). */
export function tradeWindow(league: Pick<League, "phase" | "day" | "settings">): string | null {
  if (league.phase === "playoffs") return tr("季後賽期間不能交易", "No trades during the playoffs");
  // Deadline day itself is still open: advancing stops there so the user gets one last look.
  if (league.phase === "regular" && league.day > league.settings.tradeDeadlineDay) {
    return tr(`已過交易截止日（例行賽第 ${league.settings.tradeDeadlineDay + 1} 天）`, `The trade deadline has passed (day ${league.settings.tradeDeadlineDay + 1} of the regular season)`);
  }
  return null;
}

/** Free agents can sign any time except the playoffs. */
export function signingWindow(league: Pick<League, "phase">): string | null {
  return league.phase === "playoffs" ? tr("季後賽期間不能簽自由球員", "No free-agent signings during the playoffs") : null;
}

export interface SideTotals {
  teamId: string;
  payrollBefore: number;
  outgoing: number;
  incoming: number;
  rosterBefore: number;
  playersOut: number;
  playersIn: number;
}

/** Every rule a trade breaks, in words, for one side. */
export function tradeSideProblems(s: SideTotals, league: Pick<League, "settings">, isUser: boolean, teamName: string): string[] {
  const out: string[] = [];
  const after = s.payrollBefore - s.outgoing + s.incoming;
  const limit = s.outgoing * TRADE_MATCH_RATIO + TRADE_MATCH_CUSHION;
  if (after > league.settings.salaryCap && s.incoming > limit) {
    out.push(tr(`${teamName}交易後會超過薪資上限，收進的薪資最多只能是送出的 125%（上限 ${fmtMoney(limit)}，目前 ${fmtMoney(s.incoming)}）`,
      `${teamName} would be over the cap after this trade, so they can take back at most 125% of the salary they send (limit ${fmtMoney(limit)}, now ${fmtMoney(s.incoming)})`));
  }
  const roster = s.rosterBefore - s.playersOut + s.playersIn;
  if (roster > league.settings.rosterMax) out.push(tr(`${teamName}交易後名單會有 ${roster} 人，超過 ${league.settings.rosterMax} 人上限`, `${teamName} would have ${roster} players, over the ${league.settings.rosterMax}-player limit`));
  if (!isUser && roster < league.settings.rosterMin) out.push(tr(`${teamName}交易後名單只剩 ${roster} 人，對方不會接受低於 ${league.settings.rosterMin} 人`, `${teamName} would be left with ${roster} players; they will not go below ${league.settings.rosterMin}`));
  return out;
}

/** Can a team pay this salary? Minimum contracts are always allowed. */
export function signingProblems(payrollNow: number, salary: number, rosterNow: number, league: Pick<League, "settings">): string[] {
  const out: string[] = [];
  if (rosterNow >= league.settings.rosterMax) out.push(tr(`名單已滿（${league.settings.rosterMax} 人）`, `Roster is full (${league.settings.rosterMax} players)`));
  if (salary > league.settings.minSalary && payrollNow + salary > league.settings.salaryCap) {
    out.push(tr(`薪資空間不足：簽下後總薪資 ${fmtMoney(payrollNow + salary)}，超過上限 ${fmtMoney(league.settings.salaryCap)}。超過上限時只能簽底薪（${fmtMoney(league.settings.minSalary)}）`,
      `Not enough cap space: payroll would be ${fmtMoney(payrollNow + salary)}, over the ${fmtMoney(league.settings.salaryCap)} cap. Over the cap you can only sign minimum deals (${fmtMoney(league.settings.minSalary)})`));
  }
  return out;
}

export const fmtMoney = (thousands: number) =>
  `${thousands < 0 ? "-" : ""}$${(Math.abs(thousands) / 1000).toFixed(Math.abs(thousands) >= 10000 ? 1 : 2)}M`;
