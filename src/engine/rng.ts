// Seeded randomness. Math.random is never used in the engine: the same seed
// must always produce the same league and the same game.

/** cyrb128: string -> four 32-bit seeds. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  (): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  normal(mean: number, sd: number): number;
  weighted<T>(items: readonly T[], weight: (t: T) => number): T;
  shuffle<T>(arr: T[]): T[];
}

/** sfc32 seeded from a string. */
export function makeRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.normal = (mean, sd) => {
    const u = 1 - next(), v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rng.weighted = (items, weight) => {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  };
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return rng;
}

/** Deterministic id from a seed and a label, shaped like a UUID. */
export function seededId(rng: Rng): string {
  const h = () => Math.floor(rng() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${(8 + Math.floor(rng() * 4)).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
