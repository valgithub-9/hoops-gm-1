import type { Position, Ratings } from "../db/schema";
import { clamp, type Rng } from "./rng";
import { FIRST_NAMES, LAST_NAMES } from "./names";

export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];
export const RATING_KEYS: (keyof Ratings)[] = [
  "inside", "midrange", "three", "freeThrow", "passing", "handling",
  "rebounding", "perimeterD", "interiorD", "athleticism", "stamina", "iq",
];
export const RATING_LABELS: Record<keyof Ratings, string> = {
  inside: "內線", midrange: "中距離", three: "三分", freeThrow: "罰球", passing: "傳球", handling: "運球",
  rebounding: "籃板", perimeterD: "外線防守", interiorD: "內線防守", athleticism: "體能", stamina: "耐力", iq: "球商",
};

// How each position shifts a player's ratings from their base talent.
const PROFILE: Record<Position, Partial<Ratings>> = {
  PG: { handling: 12, passing: 12, three: 4, perimeterD: 3, rebounding: -12, interiorD: -14, inside: -4 },
  SG: { three: 8, midrange: 6, handling: 4, perimeterD: 4, rebounding: -8, interiorD: -10 },
  SF: { athleticism: 4, perimeterD: 2, three: 1 },
  PF: { inside: 6, rebounding: 8, interiorD: 8, handling: -6, passing: -4, three: -5 },
  C: { inside: 10, rebounding: 14, interiorD: 14, handling: -14, passing: -8, three: -14, freeThrow: -8 },
};

// What overall means for each position.
const WEIGHTS: Record<Position, Partial<Record<keyof Ratings, number>>> = {
  PG: { handling: 2, passing: 2, three: 1.5, midrange: 1, inside: 0.5, perimeterD: 1, athleticism: 1, iq: 1.5 },
  SG: { three: 2, midrange: 1.5, handling: 1, inside: 1, perimeterD: 1.5, athleticism: 1, iq: 1 },
  SF: { three: 1, midrange: 1, inside: 1, perimeterD: 1.5, rebounding: 1, athleticism: 1.5, iq: 1, passing: 0.5 },
  PF: { inside: 1.5, rebounding: 1.5, interiorD: 1.5, midrange: 1, athleticism: 1, iq: 1, three: 0.5 },
  C: { inside: 2, rebounding: 2, interiorD: 2, athleticism: 1, iq: 1 },
};

const HEIGHT: Record<Position, number> = { PG: 188, SG: 195, SF: 201, PF: 206, C: 211 };

export function overall(pos: Position, r: Ratings): number {
  let sum = 0, w = 0;
  for (const [k, wt] of Object.entries(WEIGHTS[pos]) as [keyof Ratings, number][]) {
    sum += r[k] * wt;
    w += wt;
  }
  // Stretch so the league spans roughly 35-90 with few players above 80.
  return Math.round(clamp(45 + (sum / w - 45) * 1.35, 25, 99));
}

/** Age curve: young players are below their talent, veterans decline after 30. */
const ageShift = (age: number) => (age < 27 ? -(27 - age) * 1.3 : age > 30 ? -(age - 30) * 1.8 : 0);

export interface NewPlayer {
  firstName: string;
  lastName: string;
  age: number;
  position: Position;
  heightCm: number;
  ratings: Ratings;
  overall: number;
  potential: number;
  portraitSeed: string;
}

export function generatePlayer(rng: Rng, position: Position, talentOffset = 0): NewPlayer {
  const age = clamp(Math.round(rng.normal(26, 4)), 19, 37);
  const talent = rng.normal(50, 8) + talentOffset;
  const base = talent + ageShift(age);
  const ratings = {} as Ratings;
  for (const k of RATING_KEYS) {
    ratings[k] = Math.round(clamp(base + (PROFILE[position][k] ?? 0) + rng.normal(0, 7), 15, 99));
  }
  ratings.stamina = Math.round(clamp(ratings.stamina + 8 - Math.max(0, age - 30) * 2, 15, 99));
  const ovr = overall(position, ratings);
  const growth = age < 25 ? rng.int(0, (25 - age) * 3 + 4) : 0;
  return {
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age,
    position,
    heightCm: Math.round(rng.normal(HEIGHT[position], 4)),
    ratings,
    overall: ovr,
    potential: Math.min(99, ovr + growth),
    portraitSeed: Math.floor(rng() * 1e9).toString(36),
  };
}

/** Salary in thousands, from overall. Stars near the max, the bottom at the minimum. */
export function askingSalary(ovr: number, minSalary: number, maxSalary: number): number {
  const raw = minSalary + Math.max(0, ovr - 45) ** 2 * 25;
  return Math.round(clamp(raw, minSalary, maxSalary) / 100) * 100;
}
