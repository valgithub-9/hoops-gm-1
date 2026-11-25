import type { PlayEvent, Position, Ratings } from "../db/schema";
import { clamp, makeRng, type Rng } from "./rng";
import { tr } from "../i18n";

/**
 * Possession-by-possession game simulation, v2.
 *
 * Tracks who is on the floor. Each possession takes game-clock time; players
 * on the floor tire and players on the bench recover. Coaches substitute at
 * every possession change toward the rotation's target minutes, for tired
 * players, for foul trouble (six fouls and out) and for injuries, and keep
 * their best five in when a game is close late. Injured players (before the
 * game) do not play; their minutes go to teammates.
 *
 * Pure function: same inputs and seed, same result.
 */

export interface SimPlayer {
  id: string;
  ratings: Ratings;
  overall: number;
  minutes: number; // rotation target, team sums to 240
  starter: boolean;
  position?: Position;
  /** Games still to miss; > 0 means the player sits this game out. */
  injuryGames?: number;
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

export interface InjuryEvent { playerId: string; teamId: string; gamesOut: number; type: string }

export interface GameResult {
  scoreHome: number;
  scoreAway: number;
  overtimes: number;
  stats: Map<string, StatLine>;
  injuries: InjuryEvent[];
  fouledOut: string[];
  /** Only when asked for: recording costs memory and storage. */
  playByPlay?: PlayEvent[];
}

/** A play before the clock and score are stamped on it. */
type RawPlay = Omit<PlayEvent, "q" | "clock" | "scoreHome" | "scoreAway"> & { pts: number; home: boolean };

const QUARTER = 720;
const REGULATION = QUARTER * 4;
const OVERTIME = 300;
const FOUL_LIMIT = 6;

const INJURIES: { type: string; en: string; min: number; max: number; weight: number }[] = [
  { type: "腳踝扭傷", en: "Sprained ankle", min: 1, max: 6, weight: 30 },
  { type: "背部痙攣", en: "Back spasms", min: 1, max: 4, weight: 15 },
  { type: "手指脫臼", en: "Dislocated finger", min: 1, max: 5, weight: 10 },
  { type: "膝蓋挫傷", en: "Bruised knee", min: 2, max: 8, weight: 15 },
  { type: "腿後肌拉傷", en: "Strained hamstring", min: 4, max: 14, weight: 12 },
  { type: "腦震盪", en: "Concussion", min: 3, max: 10, weight: 6 },
  { type: "肩膀拉傷", en: "Strained shoulder", min: 5, max: 18, weight: 6 },
  { type: "足部骨折", en: "Broken foot", min: 20, max: 45, weight: 4 },
  { type: "膝蓋韌帶撕裂", en: "Torn knee ligament", min: 40, max: 70, weight: 2 },
];

const emptyLine = (): StatLine => ({
  min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, oreb: 0,
});

const group = (pos: Position | undefined) => (pos === "PG" || pos === "SG" ? "G" : pos === "SF" ? "W" : "B");

interface PS {
  p: SimPlayer;
  line: StatLine;
  target: number; // seconds
  secs: number;
  energy: number; // 0-100
  fouls: number;
  out: boolean; // fouled out or hurt in this game
  usage: number;
}

class Side {
  floor: PS[] = [];
  bench: PS[] = [];
  handling = 50; perimD = 50; interiorD = 50; reb = 50;

  constructor(public team: SimTeam, public isHome: boolean, stats: Map<string, StatLine>) {
    const available = team.players.filter((p) => !(p.injuryGames && p.injuryGames > 0));
    // Minutes of players who are out are handed to the rest, capped at 44 each.
    const total = available.reduce((n, p) => n + p.minutes, 0);
    const scale = total > 0 ? 240 / total : 0;
    const all: PS[] = available.map((p) => {
      const r = p.ratings;
      const scoring = Math.max(r.inside, r.midrange, r.three) * 0.6 + p.overall * 0.4;
      return {
        p, line: stats.get(p.id)!, secs: 0, energy: 100, fouls: 0, out: false,
        target: Math.min(44, total > 0 ? p.minutes * scale : 240 / Math.max(1, available.length)) * 60,
        // Better scorers take more shots. 2.6 gives a realistic leaderboard: one or two
        // players over 30 points a game, about 25 over 20.
        usage: (scoring / 50) ** 2.6,
      };
    });
    const starters = all.filter((s) => s.p.starter);
    const rest = all.filter((s) => !s.p.starter).sort((a, b) => b.target - a.target || b.p.overall - a.p.overall);
    this.floor = [...starters, ...rest].slice(0, 5);
    this.bench = all.filter((s) => !this.floor.includes(s));
    this.refresh();
  }

  refresh() {
    const avg = (k: keyof Ratings) => this.floor.reduce((n, s) => n + s.p.ratings[k] * fatigue(s), 0) / Math.max(1, this.floor.length);
    this.handling = (avg("handling") + avg("passing")) / 2;
    this.perimD = avg("perimeterD");
    this.interiorD = avg("interiorD");
    this.reb = avg("rebounding");
  }

  /** Substitutions at a dead ball. `crunch`: close game late, keep the best players in. */
  substitute(elapsed: number, crunch: boolean) {
    const frac = Math.min(1, elapsed / REGULATION);
    const quarter = Math.min(3, Math.floor(elapsed / QUARTER));
    // Foul trouble: 2 in the 1st quarter, 3 in the 2nd, 4 in the 3rd, 5 in the 4th.
    const inFoulTrouble = (s: PS) => s.fouls >= quarter + 2 && s.fouls < FOUL_LIMIT;
    const owed = (s: PS, ahead: number) => s.target * Math.min(1, frac + ahead) - s.secs;
    let changed = false;
    for (let i = 0; i < this.floor.length; i++) {
      const f = this.floor[i];
      const must = f.out;
      const tired = f.energy < (crunch ? 30 : 45);
      const trouble = !crunch && inFoulTrouble(f);
      const ok = this.bench.filter((b) => !b.out && (must || (b.energy > 75 && !(inFoulTrouble(b) && !crunch))));
      if (!ok.length) continue;
      const score = (b: PS) =>
        owed(b, 0.08) / 60 // minutes still owed
        + (group(b.p.position) === group(f.p.position) ? 4 : 0)
        + (crunch ? b.p.overall / 4 : 0)
        + (b.target === 0 ? -30 : 0); // the end of the bench only when nobody else can go
      const best = ok.reduce((a, b) => (score(b) > score(a) ? b : a));
      let swap: boolean;
      if (must) swap = true;
      else if (tired || trouble) swap = best.target > 0 || owed(best, 0.08) > 0;
      else if (crunch) swap = best.p.overall > f.p.overall + 3 && best.energy > 60;
      else swap = owed(best, 0.08) - owed(f, 0.04) > 240; // someone rested is well behind his minutes
      if (!swap) continue;
      this.bench.splice(this.bench.indexOf(best), 1, f);
      this.floor[i] = best;
      changed = true;
    }
    if (changed) this.refresh();
  }

  /** Clock and energy for a possession of `d` seconds. */
  tick(d: number) {
    for (const s of this.floor) {
      s.secs += d;
      s.energy = Math.max(0, s.energy - d * 0.105 * (1.45 - s.p.ratings.stamina / 100));
    }
    for (const s of this.bench) s.energy = Math.min(100, s.energy + d * 0.16);
  }
}

/** 1 when fresh, about 0.9 when exhausted. */
const fatigue = (s: PS) => 0.9 + 0.1 * (s.energy / 100);

function pick(rng: Rng, from: PS[], weight: (s: PS) => number, exclude?: PS): PS {
  const pool = exclude ? from.filter((s) => s !== exclude) : from;
  return rng.weighted(pool, weight);
}

function injure(rng: Rng, s: PS, side: Side, out: InjuryEvent[], log: RawPlay[] | null) {
  const kind = rng.weighted(INJURIES, (i) => i.weight);
  s.out = true;
  log?.push({ kind: "injury", teamId: side.team.id, playerId: s.p.id, pts: 0, home: side.isHome });
  out.push({ playerId: s.p.id, teamId: side.team.id, gamesOut: rng.int(kind.min, kind.max), type: tr(kind.type, kind.en) });
}

// Logging never draws random numbers, so a game plays out the same whether it is recorded or not.
function possession(rng: Rng, off: Side, def: Side, injuries: InjuryEvent[], fouledOut: string[], log: RawPlay[] | null): number {
  const pressure = def.team.tactics.defensePressure;
  const O = { teamId: off.team.id, home: off.isHome }, D = { teamId: def.team.id, home: def.isHome };
  const foul = (s: PS, shooting: boolean) => {
    s.line.pf++;
    log?.push({ kind: "foul", ...D, playerId: s.p.id, shooting, pts: 0 });
    if (++s.fouls >= FOUL_LIMIT && !s.out) {
      s.out = true;
      fouledOut.push(s.p.id);
      log?.push({ kind: "foulout", ...D, playerId: s.p.id, pts: 0 });
    }
  };

  // Injuries: rare, more likely for tired players and low stamina.
  for (const side of [off, def]) {
    for (const s of side.floor) {
      const p = 0.8e-4 * (1.5 - s.p.ratings.stamina / 100) * (1.6 - s.energy / 100);
      if (!s.out && rng() < p) injure(rng, s, side, injuries, log);
    }
  }

  // Non-shooting defensive foul now and then.
  if (rng() < 0.09 + pressure * 0.015) foul(pick(rng, def.floor, () => 1), false);

  for (let attempt = 0; attempt < 4; attempt++) {
    const tovP = clamp(0.135 - (off.handling - 50) * 0.0012 + (def.perimD - 50) * 0.0008 + pressure * 0.01, 0.07, 0.22);
    if (rng() < tovP) {
      const loser = pick(rng, off.floor, (s) => 110 - s.p.ratings.handling * fatigue(s));
      loser.line.tov++;
      const stealer = rng() < 0.55 ? pick(rng, def.floor, (s) => s.p.ratings.perimeterD ** 2.5) : null;
      if (stealer) stealer.line.stl++;
      log?.push({ kind: "tov", ...O, playerId: loser.p.id, otherId: stealer?.p.id, pts: 0 });
      return 0;
    }

    const shooter = pick(rng, off.floor, (s) => s.usage);
    const r = shooter.p.ratings;
    const tired = 1 - shooter.energy / 100;

    const p3 = clamp(0.35 + (r.three - 50) * 0.007 + off.team.tactics.threePointFocus * 0.05, 0.03, 0.65);
    const kind: "three" | "mid" | "rim" =
      rng() < p3 ? "three" : rng() < clamp(0.6 + (r.inside - r.midrange) * 0.008, 0.25, 0.85) ? "rim" : "mid";

    const foulP = clamp((kind === "rim" ? 0.15 : 0.05) + pressure * 0.012 + (r.athleticism - 50) * 0.001, 0.02, 0.25);
    if (rng() < foulP) {
      foul(pick(rng, def.floor, (s) => (kind === "rim" ? s.p.ratings.interiorD : s.p.ratings.perimeterD)), true);
      const n = kind === "three" ? 3 : 2;
      const ftP = clamp(0.77 + (r.freeThrow - 50) * 0.005 - tired * 0.04, 0.45, 0.95);
      let pts = 0;
      for (let i = 0; i < n; i++) {
        shooter.line.fta++;
        const made = rng() < ftP;
        if (made) { shooter.line.ftm++; pts++; }
        log?.push({ kind: "ft", ...O, playerId: shooter.p.id, made, pts: made ? 1 : 0 });
      }
      shooter.line.pts += pts;
      return pts;
    }

    let makeP =
      kind === "three" ? 0.355 + (r.three - 55) * 0.0045 - (def.perimD - 50) * 0.002
      : kind === "mid" ? 0.42 + (r.midrange - 55) * 0.004 - (def.perimD - 50) * 0.0015
      : 0.6 + (r.inside - 55) * 0.004 + (r.athleticism - 55) * 0.0015 - (def.interiorD - 50) * 0.003;
    makeP += (r.iq - 50) * 0.0006 + (off.isHome ? 0.012 : 0) - pressure * 0.006 - tired * 0.05;
    makeP = clamp(makeP, 0.15, 0.8);

    shooter.line.fga++;
    if (kind === "three") shooter.line.tpa++;

    if (rng() < makeP) {
      const pts = kind === "three" ? 3 : 2;
      shooter.line.fgm++;
      if (kind === "three") shooter.line.tpm++;
      shooter.line.pts += pts;
      const astP = kind === "three" ? 0.82 : kind === "mid" ? 0.55 : 0.5;
      const assister = rng() < astP && off.floor.length > 1 ? pick(rng, off.floor, (s) => s.p.ratings.passing ** 4, shooter) : null;
      if (assister) assister.line.ast++;
      log?.push({ kind: "make", ...O, playerId: shooter.p.id, shot: kind, otherId: assister?.p.id, pts });
      return pts;
    }

    // Blocks mostly at the rim, and mostly by the best interior defenders.
    const blockP = kind === "rim" ? 0.3 : kind === "mid" ? 0.06 : 0.02;
    const blocker = rng() < blockP ? pick(rng, def.floor, (s) => s.p.ratings.interiorD ** 4) : null;
    if (blocker) blocker.line.blk++;
    log?.push({ kind: "miss", ...O, playerId: shooter.p.id, shot: kind, otherId: blocker?.p.id, pts: 0 });

    const orebP = clamp(0.24 + (off.reb - def.reb) * 0.004, 0.12, 0.38);
    if (rng() < orebP) {
      const reb = pick(rng, off.floor, (s) => s.p.ratings.rebounding ** 2);
      reb.line.reb++;
      reb.line.oreb++;
      log?.push({ kind: "reb", ...O, playerId: reb.p.id, offensive: true, pts: 0 });
      continue;
    }
    const dreb = pick(rng, def.floor, (s) => s.p.ratings.rebounding ** 2);
    dreb.line.reb++;
    log?.push({ kind: "reb", ...D, playerId: dreb.p.id, offensive: false, pts: 0 });
    return 0;
  }
  return 0;
}

export function simGame(home: SimTeam, away: SimTeam, seed: string, opts: { playByPlay?: boolean } = {}): GameResult {
  const rng = makeRng(seed);
  const stats = new Map<string, StatLine>();
  for (const p of [...home.players, ...away.players]) stats.set(p.id, emptyLine());
  const H = new Side(home, true, stats);
  const A = new Side(away, false, stats);
  const injuries: InjuryEvent[] = [];
  const fouledOut: string[] = [];
  const raw: RawPlay[] | null = opts.playByPlay ? [] : null;
  const plays: PlayEvent[] = [];

  const pace = 100 + (home.tactics.pace + away.tactics.pace) * 2;
  const meanLength = REGULATION / (pace * 2);
  let scoreHome = 0, scoreAway = 0;
  let homeBall = rng() < 0.5;
  let clock = 0;
  let periodEnd = REGULATION;
  let overtimes = 0;

  for (;;) {
    while (clock < periodEnd) {
      const remaining = periodEnd - clock;
      const crunch = periodEnd - clock < 240 && periodEnd >= REGULATION - QUARTER && Math.abs(scoreHome - scoreAway) <= 8;
      H.substitute(clock, crunch);
      A.substitute(clock, crunch);
      const d = Math.min(remaining, clamp(rng.normal(meanLength, 4), 5, 24));
      const off = homeBall ? H : A, def = homeBall ? A : H;
      const pts = possession(rng, off, def, injuries, fouledOut, raw);
      if (raw) {
        // Stamp each play with the period, the time left in it and the running score.
        const ot = clock >= REGULATION;
        const q = ot ? 5 + Math.floor((clock - REGULATION) / OVERTIME) : Math.floor(clock / QUARTER) + 1;
        const left = Math.round(ot ? OVERTIME - ((clock - REGULATION) % OVERTIME) : QUARTER - (clock % QUARTER));
        let h = scoreHome, a = scoreAway;
        for (const { pts: p, home: isHome, ...e } of raw) {
          if (isHome) h += p; else a += p;
          plays.push({ ...e, q, clock: left, scoreHome: h, scoreAway: a });
        }
        raw.length = 0;
      }
      if (homeBall) scoreHome += pts; else scoreAway += pts;
      H.tick(d);
      A.tick(d);
      clock += d;
      homeBall = !homeBall;
    }
    if (scoreHome !== scoreAway) break;
    overtimes++;
    periodEnd += OVERTIME;
  }

  // Whole minutes that still add up to the game length: round down, then hand the
  // leftover minutes to the players with the largest remainders.
  for (const side of [H, A]) {
    const all = [...side.floor, ...side.bench];
    const total = Math.round(all.reduce((n, s) => n + s.secs, 0) / 60);
    for (const s of all) s.line.min = Math.floor(s.secs / 60);
    let left = total - all.reduce((n, s) => n + s.line.min, 0);
    for (const s of [...all].sort((x, y) => (y.secs % 60) - (x.secs % 60))) {
      if (left <= 0) break;
      s.line.min++;
      left--;
    }
  }
  return { scoreHome, scoreAway, overtimes, stats, injuries, fouledOut, playByPlay: opts.playByPlay ? plays : undefined };
}

/** Default rotation: best five start, minutes taper down the bench, total 240. */
export const STARTER_MINUTES = [35, 34, 33, 31, 30];
export const BENCH_MINUTES = [20, 17, 14, 11, 8, 5, 2];

export function autoRotation(players: { id: string; overall: number; injury?: { gamesRemaining: number } | null }[]) {
  // Healthy players first, so the default lineup never starts someone who is hurt.
  const sorted = [...players].sort((a, b) =>
    Number(!!a.injury?.gamesRemaining) - Number(!!b.injury?.gamesRemaining) || b.overall - a.overall);
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
