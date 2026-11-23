import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { FREE_AGENT, SaveDb, type TradeAsset } from "../db/schema";
import { createLeague } from "../data/league";
import { advance } from "../data/advance";
import { askFor, judgeOffer, releasePlayer, signFreeAgent } from "../data/freeAgency";
import { evaluateTrade, executeTrade, loadTradeContext, tradablePicks, tradeProblems, type TradeContext, type TradeOffer } from "../data/trade";
import { packageValue } from "../engine/value";
import { payroll, signingProblems, tradeSideProblems } from "../rules/cap";

const db = new SaveDb();
let id = "";
let ctx: TradeContext;
const P = (playerId: string): TradeAsset => ({ kind: "player", playerId });

/** The AI team with the most cap room, so salary matching does not get in the way of the scenario. */
const roomiest = () => [...ctx.teams.values()].filter((t) => !t.isUser)
  .sort((a, b) => payroll(ctx.contracts, a.id, ctx.league.season) - payroll(ctx.contracts, b.id, ctx.league.season))[0];
const rosterOf = (teamId: string) => [...ctx.players.values()].filter((p) => p.teamId === teamId).sort((a, b) => b.overall - a.overall);

beforeAll(async () => {
  id = await createLeague(db, { name: "Market", numTeams: 8, gamesPerSeason: 20, userTeamIndex: 0, difficulty: "normal", seed: "market" });
  ctx = await loadTradeContext(db, id);
}, 60_000);

describe("trade value", () => {
  it("three role players are worth less than one star", () => {
    expect(packageValue([30, 30, 30], 0)).toBeLessThan(packageValue([100], 0));
  });

  it("rejects a scrub for the partner's best player, accepts the reverse", () => {
    const partner = roomiest();
    const mine = rosterOf(ctx.league.userTeamId), theirs = rosterOf(partner.id);
    const lopsided: TradeOffer = { partnerId: partner.id, give: [P(mine[mine.length - 1].id)], get: [P(theirs[0].id)] };
    expect(evaluateTrade(ctx, lopsided).decision).not.toBe("accept");
    const gift: TradeOffer = { partnerId: partner.id, give: [P(mine[0].id)], get: [P(theirs[theirs.length - 1].id)] };
    expect(tradeProblems(ctx, gift)).toEqual([]);
    expect(evaluateTrade(ctx, gift).decision).toBe("accept");
  });

  it("is harder on hard difficulty", () => {
    const partner = roomiest();
    const mine = rosterOf(ctx.league.userTeamId), theirs = rosterOf(partner.id);
    // Find a fair-ish 1-for-1 that normal accepts, then check hard is never more generous.
    for (const a of mine.slice(0, 8)) for (const b of theirs.slice(0, 8)) {
      const offer: TradeOffer = { partnerId: partner.id, give: [P(a.id)], get: [P(b.id)] };
      const hard = evaluateTrade({ ...ctx, league: { ...ctx.league, difficulty: "hard" } }, offer);
      const easy = evaluateTrade({ ...ctx, league: { ...ctx.league, difficulty: "easy" } }, offer);
      if (hard.decision === "accept") expect(easy.decision).toBe("accept");
    }
  });
});

describe("trade rules", () => {
  it("enforces salary matching over the cap and roster limits", () => {
    const settings = ctx.league.settings;
    const over = tradeSideProblems({ teamId: "x", payrollBefore: settings.salaryCap, outgoing: 1000, incoming: 20000, rosterBefore: 14, playersOut: 1, playersIn: 1 }, ctx.league, true, "你的球隊");
    expect(over.join()).toMatch(/125%/);
    const under = tradeSideProblems({ teamId: "x", payrollBefore: 10000, outgoing: 1000, incoming: 20000, rosterBefore: 14, playersOut: 1, playersIn: 1 }, ctx.league, true, "你的球隊");
    expect(under).toEqual([]);
    const full = tradeSideProblems({ teamId: "x", payrollBefore: 0, outgoing: 0, incoming: 0, rosterBefore: 15, playersOut: 0, playersIn: 1 }, ctx.league, true, "你的球隊");
    expect(full.join()).toMatch(/上限/);
  });

  it("closes trades after the deadline", () => {
    const partner = roomiest();
    const offer: TradeOffer = { partnerId: partner.id, give: [P(rosterOf(ctx.league.userTeamId)[0].id)], get: [] };
    const late = { ...ctx, league: { ...ctx.league, day: ctx.league.settings.tradeDeadlineDay + 1 } };
    const lastDay = { ...ctx, league: { ...ctx.league, day: ctx.league.settings.tradeDeadlineDay } };
    expect(tradeProblems(lastDay, offer).join()).not.toMatch(/截止日/);
    expect(tradeProblems(late, offer).join()).toMatch(/截止日/);
  });

  it("executes an accepted trade: players, contracts and picks change hands", async () => {
    const partner = roomiest();
    const mine = rosterOf(ctx.league.userTeamId), theirs = rosterOf(partner.id);
    const myPick = tradablePicks(ctx, ctx.league.userTeamId)[0];
    const offer: TradeOffer = { partnerId: partner.id, give: [P(mine[1].id), { kind: "pick", pickId: myPick.id }], get: [P(theirs[theirs.length - 1].id)] };
    expect(evaluateTrade(ctx, offer).decision).toBe("accept");
    await executeTrade(db, id, offer);
    expect((await db.players.get(mine[1].id))!.teamId).toBe(partner.id);
    expect((await db.players.get(theirs[theirs.length - 1].id))!.teamId).toBe(ctx.league.userTeamId);
    expect((await db.draftPicks.get(myPick.id))!.ownerTeamId).toBe(partner.id);
    const c = (await db.contracts.where("playerId").equals(mine[1].id).toArray()).find((x) => x.endSeason >= ctx.league.season)!;
    expect(c.teamId).toBe(partner.id);
    // Doing it again fails: the assets moved.
    await expect(executeTrade(db, id, offer)).rejects.toThrow();
    ctx = await loadTradeContext(db, id);
  });

  it("a counter-offer, when made, is one the AI accepts", async () => {
    let found = 0;
    for (const partner of [...ctx.teams.values()].filter((t) => !t.isUser)) {
      const mine = rosterOf(ctx.league.userTeamId), theirs = rosterOf(partner.id);
      for (let i = 0; i < 6; i++) {
        const offer: TradeOffer = { partnerId: partner.id, give: [P(mine[i + 1].id)], get: [P(theirs[i].id)] };
        const v = evaluateTrade(ctx, offer);
        if (v.decision === "counter") {
          found++;
          expect(evaluateTrade(ctx, v.counter!).decision).toBe("accept");
          expect(tradeProblems(ctx, v.counter!)).toEqual([]);
        }
      }
    }
    console.log("counter-offers checked", found);
  });
});

describe("free agency", () => {
  it("accepts an offer at the asking price, rejects a lowball", () => {
    const fa = [...ctx.players.values()].find((p) => p.teamId === FREE_AGENT && !p.isProspect)!;
    const ask = askFor(fa, ctx.league);
    expect(judgeOffer(ask, ask).accepted).toBe(true);
    expect(judgeOffer(ask, { ...ask, salary: Math.round(ask.salary * 0.7) }).accepted).toBe(ask.salary * 0.7 >= ask.salary);
  });

  it("only allows minimum contracts over the cap", () => {
    const s = ctx.league.settings;
    expect(signingProblems(s.salaryCap, s.minSalary, 13, ctx.league)).toEqual([]);
    expect(signingProblems(s.salaryCap, s.minSalary + 500, 13, ctx.league).join()).toMatch(/薪資空間/);
    expect(signingProblems(0, s.minSalary, 15, ctx.league).join()).toMatch(/名單已滿/);
  });

  it("release keeps the salary on the books, signing fills the spot", async () => {
    ctx = await loadTradeContext(db, id);
    const userId = ctx.league.userTeamId;
    const before = payroll(ctx.contracts, userId, ctx.league.season);
    const cut = rosterOf(userId).slice(-1)[0];
    await releasePlayer(db, id, cut.id);
    ctx = await loadTradeContext(db, id);
    expect(payroll(ctx.contracts, userId, ctx.league.season)).toBe(before);
    expect((await db.players.get(cut.id))!.teamId).toBe(FREE_AGENT);

    const fa = [...ctx.players.values()].filter((p) => p.teamId === FREE_AGENT && !p.isProspect && p.id !== cut.id).sort((a, b) => a.overall - b.overall)[0];
    const r = await signFreeAgent(db, id, fa.id, { salary: ctx.league.settings.minSalary, years: 1 });
    if (!r.accepted) await signFreeAgent(db, id, fa.id, askFor(fa, ctx.league));
    expect((await db.players.get(fa.id))!.teamId).toBe(userId);
    // The team can still play: rotation stays legal.
    const result = await advance(db, id, "day");
    expect(result.gamesPlayed).toBeGreaterThan(0);
  }, 60_000);
});
