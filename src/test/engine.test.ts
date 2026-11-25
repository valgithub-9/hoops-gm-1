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
      expect(teamMin).toBe(240 + r.overtimes * 25);
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

  it("records play-by-play without changing the game, and the plays add up", () => {
    for (let i = 0; i < 30; i++) {
      const plain = simGame(h, a, `pbp${i}`);
      const rec = simGame(h, a, `pbp${i}`, { playByPlay: true });
      expect([rec.scoreHome, rec.scoreAway]).toEqual([plain.scoreHome, plain.scoreAway]);
      expect([...rec.stats.entries()]).toEqual([...plain.stats.entries()]);
      const plays = rec.playByPlay!;
      const last = plays[plays.length - 1];
      expect([last.scoreHome, last.scoreAway]).toEqual([rec.scoreHome, rec.scoreAway]);
      // Score never goes down, clock stays inside its period, periods only move forward.
      for (let k = 1; k < plays.length; k++) {
        expect(plays[k].scoreHome).toBeGreaterThanOrEqual(plays[k - 1].scoreHome);
        expect(plays[k].scoreAway).toBeGreaterThanOrEqual(plays[k - 1].scoreAway);
        expect(plays[k].q).toBeGreaterThanOrEqual(plays[k - 1].q);
      }
      expect(plays.every((p) => p.clock >= 0 && p.clock <= 720)).toBe(true);
      // Every player's points, rebounds and assists match the box score.
      for (const [id, line] of rec.stats) {
        const mine = plays.filter((p) => p.playerId === id);
        const pts = mine.reduce((n, p) => n + (p.kind === "make" ? (p.shot === "three" ? 3 : 2) : p.kind === "ft" && p.made ? 1 : 0), 0);
        expect(pts).toBe(line.pts);
        expect(mine.filter((p) => p.kind === "reb").length).toBe(line.reb);
        expect(plays.filter((p) => p.kind === "make" && p.otherId === id).length).toBe(line.ast);
      }
    }
  });

  it("is deterministic", () => {
    const x = simGame(h, a, "same"), y = simGame(h, a, "same");
    expect([...x.stats.entries()]).toEqual([...y.stats.entries()]);
    expect(x.injuries).toEqual(y.injuries);
  });
});
