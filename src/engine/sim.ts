import type { Ratings } from "../db/schema";
import { clamp, makeRng, type Rng } from "./rng";

/**
 * Possession-by-possession game simulation.
 *
 * Version 1 simplifications (see replica/build-log.md):
 *   - who is on the floor is not tracked; each player's share of the action
 *     is weighted by their rotation minutes, and box-score minutes are the
 *     rotation minutes (plus overtime for starters)
 *   - no fatigue, fouls-out, injuries or play-by-play yet
 * Pure function: same inputs and seed, same result.
 */

export interface SimPlayer {
  id: string;
  ratings: Ratings;
  overall: number;
  minutes: number; // rotation minutes, team sums to 240
  starter: boolean;
}

export interface SimTeam {
  id: string;
  players: SimPlayer[];
  tactics: { pace: number; threePointFocus: number; defensePressure: number };
}

export interface StatLine {
  min: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; pf: number;
  oreb: number;
}

export interface GameResult {
  scoreHome: number;
  scoreAway: number;
  overtimes: number;
  stats: Map<string, StatLine>;
}

const emptyLine = (): StatLine => ({
  min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, oreb: 0,
});

/** Minute-weighted team average of a rating. */
function teamAvg(t: SimTeam, k: keyof Ratings): number {
  let s = 0, m = 0;
  for (const p of t.players) { s += p.ratings[k] * p.minutes; m += p.minutes; }
  return m ? s / m : 50;
}

interface Side {
  team: SimTeam;
  active: SimPlayer[];
  usage: number[];
  handling: number;
  perimD: number;
  interiorD: number;
  reb: number;
  isHome: boolean;
}

function prepare(team: SimTeam, isHome: boolean): Side {
  const active = team.players.filter((p) => p.minutes > 0);
  // Better scorers take more shots: usage grows faster than linearly with skill.
  const usage = active.map((p) => {
    const r = p.ratings;
    const scoring = Math.max(r.inside, r.midrange, r.three) * 0.6 + p.overall * 0.4;
    return p.minutes * (scoring / 50) ** 3;
  });
  return {
    team, active, usage, isHome,
    handling: (teamAvg(team, "handling") + teamAvg(team, "passing")) / 2,
    perimD: teamAvg(team, "perimeterD"),
    interiorD: teamAvg(team, "interiorD"),
    reb: teamAvg(team, "rebounding"),
  };
}

function pickBy(rng: Rng, side: Side, weight: (p: SimPlayer, i: number) => number, exclude?: SimPlayer): SimPlayer {
  const pool = exclude ? side.active.filter((p) => p !== exclude) : side.active;
  return rng.weighted(pool, (p) => weight(p, side.active.indexOf(p)));
}

function possession(rng: Rng, off: Side, def: Side, stats: Map<string, StatLine>): number {
  const line = (p: SimPlayer) => stats.get(p.id)!;
  const pressure = def.team.tactics.defensePressure;

  for (let attempt = 0; attempt < 4; attempt++) {
    // Turnover
    const tovP = clamp(0.135 - (off.handling - 50) * 0.0012 + (def.perimD - 50) * 0.0008 + pressure * 0.01, 0.07, 0.22);
    if (rng() < tovP) {
      const loser = pickBy(rng, off, (p) => p.minutes * (110 - p.ratings.handling));
      line(loser).tov++;
      if (rng() < 0.55) line(pickBy(rng, def, (p) => p.minutes * p.ratings.perimeterD)).stl++;
      return 0;
    }

    const shooter = pickBy(rng, off, (_, i) => off.usage[i]);
    const s = shooter.ratings;

    // Shot selection
    const p3 = clamp(0.35 + (s.three - 50) * 0.007 + off.team.tactics.threePointFocus * 0.05, 0.03, 0.65);
    const r = rng();
    const kind: "three" | "mid" | "rim" =
      r < p3 ? "three" : rng() < clamp(0.6 + (s.inside - s.midrange) * 0.008, 0.25, 0.85) ? "rim" : "mid";

    // Shooting foul: free throws instead of a field-goal attempt
    const foulP = clamp((kind === "rim" ? 0.15 : 0.05) + pressure * 0.012 + (s.athleticism - 50) * 0.001, 0.02, 0.25);
    if (rng() < foulP) {
      line(pickBy(rng, def, (p) => p.minutes)).pf++;
      const n = kind === "three" ? 3 : 2;
      const ftP = clamp(0.77 + (s.freeThrow - 50) * 0.005, 0.45, 0.95);
      let pts = 0;
      for (let i = 0; i < n; i++) {
        line(shooter).fta++;
        if (rng() < ftP) { line(shooter).ftm++; pts++; }
      }
      line(shooter).pts += pts;
      return pts;
    }

    // Make probability: shooter skill against the defence
    let makeP =
      kind === "three" ? 0.355 + (s.three - 55) * 0.0045 - (def.perimD - 50) * 0.002
      : kind === "mid" ? 0.42 + (s.midrange - 55) * 0.004 - (def.perimD - 50) * 0.0015
      : 0.6 + (s.inside - 55) * 0.004 + (s.athleticism - 55) * 0.0015 - (def.interiorD - 50) * 0.003;
    makeP += (s.iq - 50) * 0.0006 + (off.isHome ? 0.012 : 0) - pressure * 0.006;
    makeP = clamp(makeP, 0.15, 0.8);

    line(shooter).fga++;
    if (kind === "three") line(shooter).tpa++;

    if (rng() < makeP) {
      const pts = kind === "three" ? 3 : 2;
      line(shooter).fgm++;
      if (kind === "three") line(shooter).tpm++;
      line(shooter).pts += pts;
      const astP = kind === "three" ? 0.82 : kind === "mid" ? 0.55 : 0.5;
      if (rng() < astP) line(pickBy(rng, off, (p) => p.minutes * p.ratings.passing ** 2, shooter)).ast++;
      return pts;
    }

    if (kind === "rim" && rng() < 0.14) line(pickBy(rng, def, (p) => p.minutes * p.ratings.interiorD ** 2)).blk++;

    // Rebound
    const orebP = clamp(0.24 + (off.reb - def.reb) * 0.004, 0.12, 0.38);
    if (rng() < orebP) {
      const reb = pickBy(rng, off, (p) => p.minutes * p.ratings.rebounding ** 2);
      line(reb).reb++;
      line(reb).oreb++;
      continue; // second chance
    }
    line(pickBy(rng, def, (p) => p.minutes * p.ratings.rebounding ** 2)).reb++;
    return 0;
  }
  return 0;
}

export function simGame(home: SimTeam, away: SimTeam, seed: string): GameResult {
  const rng = makeRng(seed);
  const stats = new Map<string, StatLine>();
  for (const p of [...home.players, ...away.players]) {
    const l = emptyLine();
    l.min = p.minutes;
    stats.set(p.id, l);
  }
  const H = prepare(home, true);
  const A = prepare(away, false);

  const pace = 100 + (home.tactics.pace + away.tactics.pace) * 2;
  let scoreHome = 0, scoreAway = 0;
  let homeBall = rng() < 0.5;
  const play = (n: number) => {
    for (let i = 0; i < n; i++) {
      if (homeBall) scoreHome += possession(rng, H, A, stats);
      else scoreAway += possession(rng, A, H, stats);
      homeBall = !homeBall;
    }
  };

  play(Math.round(pace * 2 + rng.normal(0, 4)));
  let overtimes = 0;
  while (scoreHome === scoreAway) {
    overtimes++;
    play(Math.round((pace * 2 * 5) / 48 + rng.normal(0, 1)));
    for (const t of [home, away]) {
      const starters = t.players.filter((p) => p.starter);
      for (const p of starters) stats.get(p.id)!.min += 5;
    }
  }
  return { scoreHome, scoreAway, overtimes, stats };
}

/** Default rotation: best five start, minutes taper down the bench, total 240. */
export const STARTER_MINUTES = [35, 34, 33, 31, 30];
export const BENCH_MINUTES = [20, 17, 14, 11, 8, 5, 2];

export function autoRotation(players: { id: string; overall: number }[]) {
  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const minutes: Record<string, number> = {};
  sorted.forEach((p, i) => {
    minutes[p.id] = i < 5 ? STARTER_MINUTES[i] : (BENCH_MINUTES[i - 5] ?? 0);
  });
  // Short rosters: hand leftover minutes to the starters so the team still plays 240.
  let left = 240 - Object.values(minutes).reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0 && sorted.length; i = (i + 1) % Math.min(5, sorted.length)) {
    minutes[sorted[i].id]++;
    left--;
  }
  return {
    starters: sorted.slice(0, 5).map((p) => p.id),
    minutes,
    tactics: { pace: 0, threePointFocus: 0, defensePressure: 0 },
  };
}
