// How the AI values players and picks in trades. Pure functions; all inputs passed in.
// Units are arbitrary "value points": a solid 70-overall starter on a fair deal is about 90,
// the first pick about 60, a minimum-contract bench player about 0-5.
import { askingSalary } from "./players";
import { clamp } from "./rng";

export type Strategy = "contending" | "rebuilding";

export interface PlayerForValue {
  overall: number;
  potential: number;
  age: number;
  salary: number; // thousands per year
  yearsLeft: number; // including this season
}

/** What the player is likely to be worth over the next few years. */
export function effectiveOverall(p: Pick<PlayerForValue, "overall" | "potential" | "age">, strategy: Strategy): number {
  const youth = clamp((26 - p.age) / 7, 0, 1); // 19 -> 1, 26+ -> 0
  const upside = Math.max(0, p.potential - p.overall) * youth * (strategy === "rebuilding" ? 0.8 : 0.45);
  const decline = p.age >= 31 ? (p.age - 30) * (strategy === "rebuilding" ? 2.5 : 1.2) : 0;
  return p.overall + upside - decline;
}

/** Talent grows much faster than linearly: one star is worth more than several role players. */
const talent = (eff: number) => Math.max(0, eff - 42) ** 2 / 7;

export function playerValue(p: PlayerForValue, strategy: Strategy, minSalary: number, maxSalary: number): number {
  const eff = effectiveOverall(p, strategy);
  // Contract: paying less than the player is worth is an asset, paying more a burden, for each year left.
  const worth = askingSalary(eff, minSalary, maxSalary);
  const surplus = ((worth - p.salary) / 1000) * Math.min(p.yearsLeft, 4) * 0.6;
  return talent(eff) + surplus;
}

/**
 * A draft pick, from where it is expected to land. `projectedPick` is 1-based within the round;
 * future seasons are discounted, and rebuilding teams like picks more.
 */
export function pickValue(round: 1 | 2, projectedPick: number, numTeams: number, seasonsAway: number, strategy: Strategy): number {
  const spot = clamp((projectedPick - 1) / Math.max(1, numTeams - 1), 0, 1); // 0 = first pick
  const base = round === 1 ? 62 - spot * 48 : 6 - spot * 4;
  return base * 0.9 ** seasonsAway * (strategy === "rebuilding" ? 1.25 : 0.9);
}

/**
 * Total value of a package to the team receiving it. Assets are sorted best first and each
 * extra one counts for less, so three role players never add up to one star.
 * Each incoming player beyond the ones going out costs a roster spot.
 */
export function packageValue(values: number[], extraPlayers: number): number {
  const weights = [1, 0.6, 0.4, 0.25, 0.15];
  const sum = [...values].sort((a, b) => b - a).reduce((n, v, i) => n + (v > 0 ? v * (weights[i] ?? 0.1) : v), 0);
  return sum - Math.max(0, extraPlayers) * 4;
}

/** How much more the AI wants back than it gives, by difficulty. */
export const MARGIN: Record<"easy" | "normal" | "hard", number> = { easy: 0.95, normal: 1.05, hard: 1.15 };

/** Estimated pick within its round, from the original team's current win percentage. */
export function projectPick(winPct: number, numTeams: number): number {
  return clamp(Math.round(1 + winPct * (numTeams - 1)), 1, numTeams);
}
