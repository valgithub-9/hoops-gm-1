import type { Rng } from "./rng";

export interface ScheduledGame { day: number; home: number; away: number }

/**
 * Round-robin by the circle method: every day each team plays exactly once,
 * rounds repeat with home and away flipped, until every team has
 * gamesPerSeason games. numTeams must be even.
 */
export function makeSchedule(numTeams: number, gamesPerSeason: number, rng: Rng): ScheduledGame[] {
  if (numTeams % 2 !== 0) throw new Error("numTeams must be even");
  const order = rng.shuffle([...Array(numTeams).keys()]);
  const rounds: [number, number][][] = [];
  const ring = order.slice(1);
  for (let r = 0; r < numTeams - 1; r++) {
    const round: [number, number][] = [];
    const teams = [order[0], ...ring];
    for (let i = 0; i < numTeams / 2; i++) {
      const a = teams[i], b = teams[numTeams - 1 - i];
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    ring.unshift(ring.pop()!);
  }
  const games: ScheduledGame[] = [];
  for (let day = 0; day < gamesPerSeason; day++) {
    const cycle = Math.floor(day / rounds.length);
    for (const [a, b] of rounds[day % rounds.length]) {
      const [home, away] = cycle % 2 === 0 ? [a, b] : [b, a];
      games.push({ day, home, away });
    }
  }
  return games;
}
