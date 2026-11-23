import { describe, expect, it } from "vitest";
import { generatePlayer, POSITIONS } from "../engine/players";
import { makeRng } from "../engine/rng";
import { autoRotation, simGame, type SimTeam } from "../engine/sim";

function team(seed: string, injured: number[] = []): SimTeam {
  const rng = makeRng(seed);
  const ps = Array.from({ length: 13 }, (_, i) => ({ id: `${seed}${i}`, ...generatePlayer(rng, POSITIONS[i % 5], 3) }));
  const rot = autoRotation(ps);
  return {
    id: seed, tactics: rot.tactics,
    players: ps.map((p, i) => ({
      id: p.id, ratings: p.ratings, overall: p.overall, position: p.position,
      minutes: rot.minutes[p.id], starter: rot.starters.includes(p.id), injuryGames: injured.includes(i) ? 3 : 0,
    })),
  };
}

describe("engine v2: lineups, fatigue, fouls, injuries", () => {
  const games = 400;
  const h = team("home"), a = team("away");
  const results = Array.from({ length: games }, (_, i) => simGame(h, a, `g${i}`));

  it("plays everyone close to their rotation minutes, and never more than the game", () => {
    for (const p of h.players) {
      const mins = results.map((r) => r.stats.get(p.id)!.min);
      const avg = mins.reduce((x, y) => x + y, 0) / games;
      if (p.minutes >= 10) expect(Math.abs(avg - p.minutes)).toBeLessThan(5);
      expect(Math.max(...mins)).toBeLessThanOrEqual(48 + 5 * 4);
    }
    for (const r of results) {
      const teamMin = h.players.reduce((n, p) => n + r.stats.get(p.id)!.min, 0);
      expect(teamMin).toBeGreaterThanOrEqual(237);
      expect(teamMin).toBeLessThanOrEqual(243 + r.overtimes * 25);
    }
  });

  it("fouls players out sometimes, never with fewer than six fouls", () => {
    const outs = results.flatMap((r) => r.fouledOut.map((id) => r.stats.get(id)!.pf));
    expect(outs.every((pf) => pf >= 6)).toBe(true);
    const perGame = outs.length / games;
    console.log("foul-outs per game", perGame.toFixed(3));
    expect(perGame).toBeLessThan(0.4);
    const pf = results.reduce((n, r) => n + h.players.reduce((m, p) => m + r.stats.get(p.id)!.pf, 0), 0) / games;
    console.log("fouls per team", pf.toFixed(1));
    expect(pf).toBeGreaterThan(14);
    expect(pf).toBeLessThan(26);
  });

  it("injures players at a realistic rate, with games out", () => {
    const inj = results.flatMap((r) => r.injuries);
    const perTeamGame = inj.length / (games * 2);
    console.log("injuries per team-game", perTeamGame.toFixed(3), "examples", inj.slice(0, 3).map((i) => `${i.type} ${i.gamesOut}`).join(", "));
    expect(perTeamGame).toBeGreaterThan(0.02);
    expect(perTeamGame).toBeLessThan(0.15);
    expect(inj.every((i) => i.gamesOut >= 1)).toBe(true);
  });

  it("an injured player does not play, and his minutes go to teammates", () => {
    const hurt = team("home", [0, 1]);
    const r = simGame(hurt, a, "x");
    expect(r.stats.get(hurt.players[0].id)!.min).toBe(0);
    expect(r.stats.get(hurt.players[1].id)!.min).toBe(0);
    const total = hurt.players.reduce((n, p) => n + r.stats.get(p.id)!.min, 0);
    expect(total).toBeGreaterThanOrEqual(237);
  });

  it("is deterministic", () => {
    const x = simGame(h, a, "same"), y = simGame(h, a, "same");
    expect([...x.stats.entries()]).toEqual([...y.stats.entries()]);
    expect(x.injuries).toEqual(y.injuries);
  });
});
