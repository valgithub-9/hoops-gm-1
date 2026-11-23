import {
  FREE_AGENT,
  type Contract, type DraftPick, type League, type Player, type SaveDb, type Team, type TeamSeason, type Trade, type TradeAsset,
} from "../db/schema";
import { autoRotation } from "../engine/sim";
import { MARGIN, packageValue, pickValue, playerValue, projectPick, type Strategy } from "../engine/value";
import { currentContract, fmtMoney, payroll, tradeSideProblems, tradeWindow } from "../rules/cap";
import { MAX_SALARY } from "./league";
import { fullName, newEvent } from "./season";

export interface TradeOffer {
  partnerId: string;
  /** What the user sends. */
  give: TradeAsset[];
  /** What the user gets. */
  get: TradeAsset[];
}

export interface TradeContext {
  league: League;
  teams: Map<string, Team>;
  players: Map<string, Player>;
  contracts: Contract[];
  picks: Map<string, DraftPick>;
  standings: TeamSeason[];
}

export async function loadTradeContext(db: SaveDb, leagueId: string): Promise<TradeContext> {
  const league = (await db.leagues.get(leagueId))!;
  const [teams, players, contracts, picks, standings] = await Promise.all([
    db.teams.where("leagueId").equals(leagueId).toArray(),
    db.players.where("leagueId").equals(leagueId).toArray(),
    db.contracts.where("leagueId").equals(leagueId).toArray(),
    db.draftPicks.where("leagueId").equals(leagueId).toArray(),
    db.teamSeasons.where("[leagueId+season]").equals([leagueId, league.season]).toArray(),
  ]);
  return {
    league,
    teams: new Map(teams.map((t) => [t.id, t])),
    players: new Map(players.map((p) => [p.id, p])),
    contracts, picks: new Map(picks.map((p) => [p.id, p])), standings,
  };
}

/** The season whose payroll a trade or signing is judged against: next season once this one is over. */
export const capSeason = (league: Pick<League, "phase" | "season">) => (league.phase === "draft" ? league.season + 1 : league.season);

/** Picks a team can trade right now: unused, this season's draft or later. */
export const tradablePicks = (ctx: TradeContext, teamId: string) =>
  [...ctx.picks.values()]
    .filter((p) => p.ownerTeamId === teamId && !p.playerId && p.season >= ctx.league.season)
    .sort((a, b) => a.season - b.season || a.round - b.round);

const winPct = (ctx: TradeContext, teamId: string) => {
  const s = ctx.standings.find((x) => x.teamId === teamId);
  if (s && s.wins + s.losses >= 5) return s.wins / (s.wins + s.losses);
  // Early season: judge by roster strength instead.
  const strength = (id: string) => {
    const t = ctx.teams.get(id)!;
    return [...ctx.players.values()].filter((p) => p.teamId === id)
      .reduce((n, p) => n + p.overall * (t.rotation.minutes[p.id] ?? 0), 0);
  };
  const all = [...ctx.teams.keys()].map(strength).sort((a, b) => a - b);
  return all.indexOf(strength(teamId)) / Math.max(1, all.length - 1);
};

export const strategyOf = (ctx: TradeContext, teamId: string): Strategy => (winPct(ctx, teamId) >= 0.5 ? "contending" : "rebuilding");

export function assetLabel(ctx: TradeContext, a: TradeAsset): string {
  if (a.kind === "player") {
    const p = ctx.players.get(a.playerId);
    return p ? `${fullName(p)}（${p.position}, ${p.overall}）` : "未知球員";
  }
  const pk = ctx.picks.get(a.pickId);
  if (!pk) return "未知選秀權";
  const orig = ctx.teams.get(pk.originalTeamId)!;
  return `${pk.season} ${pk.round === 1 ? "首輪" : "次輪"}籤${pk.ownerTeamId !== pk.originalTeamId ? `（原屬 ${orig.abbrev}）` : `（${orig.abbrev}）`}${pk.pickNo ? ` 第 ${pk.pickNo} 順位` : ""}`;
}

export function assetSalary(ctx: TradeContext, a: TradeAsset): number {
  if (a.kind !== "player") return 0;
  return currentContract(ctx.contracts, a.playerId, capSeason(ctx.league))?.salaryPerYear ?? 0;
}

/** Value of one asset to the team that would receive it. */
export function assetValue(ctx: TradeContext, a: TradeAsset, receiver: Strategy): number {
  const { league } = ctx;
  if (a.kind === "player") {
    const p = ctx.players.get(a.playerId)!;
    const season = capSeason(league);
    const c = currentContract(ctx.contracts, p.id, season);
    return playerValue({
      overall: p.overall, potential: p.potential, age: season - p.bornYear,
      salary: c?.salaryPerYear ?? league.settings.minSalary, yearsLeft: c ? c.endSeason - season + 1 : 1,
    }, receiver, league.settings.minSalary, MAX_SALARY);
  }
  const pk = ctx.picks.get(a.pickId)!;
  const spot = pk.pickNo ? ((pk.pickNo - 1) % league.settings.numTeams) + 1 : projectPick(winPct(ctx, pk.originalTeamId), league.settings.numTeams);
  return pickValue(pk.round, spot, league.settings.numTeams, pk.season - league.season, receiver);
}

/** Every reason this trade cannot happen, in words. Empty when it is legal. */
export function tradeProblems(ctx: TradeContext, offer: TradeOffer): string[] {
  const { league } = ctx;
  const out: string[] = [];
  const window = tradeWindow(league);
  if (window) out.push(window);
  const userId = league.userTeamId;
  if (offer.partnerId === userId || !ctx.teams.has(offer.partnerId)) out.push("請選擇交易對象");
  if (offer.give.length === 0 && offer.get.length === 0) out.push("還沒有選任何球員或選秀權");
  const owns = (a: TradeAsset, teamId: string) =>
    a.kind === "player" ? ctx.players.get(a.playerId)?.teamId === teamId
      : (() => { const p = ctx.picks.get(a.pickId); return !!p && p.ownerTeamId === teamId && !p.playerId && p.season >= league.season; })();
  if (!offer.give.every((a) => owns(a, userId)) || !offer.get.every((a) => owns(a, offer.partnerId))) out.push("有球員或選秀權已經不屬於這支球隊了");
  if (out.length) return out;

  const season = capSeason(league);
  const salary = (as: TradeAsset[]) => as.reduce((n, a) => n + assetSalary(ctx, a), 0);
  const count = (as: TradeAsset[]) => as.filter((a) => a.kind === "player").length;
  const rosterOf = (id: string) => [...ctx.players.values()].filter((p) => p.teamId === id).length;
  const partner = ctx.teams.get(offer.partnerId)!;
  out.push(...tradeSideProblems({
    teamId: userId, payrollBefore: payroll(ctx.contracts, userId, season), outgoing: salary(offer.give), incoming: salary(offer.get),
    rosterBefore: rosterOf(userId), playersOut: count(offer.give), playersIn: count(offer.get),
  }, league, true, "你的球隊"));
  out.push(...tradeSideProblems({
    teamId: partner.id, payrollBefore: payroll(ctx.contracts, partner.id, season), outgoing: salary(offer.get), incoming: salary(offer.give),
    rosterBefore: rosterOf(partner.id), playersOut: count(offer.get), playersIn: count(offer.give),
  }, league, false, `${partner.name}`));
  return out;
}

export interface TradeVerdict {
  decision: "accept" | "counter" | "reject";
  reason: string;
  /** How close the offer is to what the AI needs, 0-1+ (1 = enough). */
  ratio: number;
  counter?: TradeOffer;
}

/** The partner AI's answer. Deterministic: the same offer always gets the same answer. */
export function evaluateTrade(ctx: TradeContext, offer: TradeOffer): TradeVerdict {
  const strategy = strategyOf(ctx, offer.partnerId);
  const margin = MARGIN[ctx.league.difficulty];
  const players = (as: TradeAsset[]) => as.filter((a) => a.kind === "player").length;
  const receive = (give: TradeAsset[]) =>
    packageValue(give.map((a) => assetValue(ctx, a, strategy)), players(give) - players(offer.get));
  const giveUp = packageValue(offer.get.map((a) => assetValue(ctx, a, strategy)), 0);
  const need = Math.max(1, giveUp * margin);
  const got = receive(offer.give);
  const ratio = got / need;
  const style = strategy === "rebuilding" ? "我們在重建，比較看重年輕球員和選秀權。" : "我們在拚冠軍，要能馬上上場幫忙的人。";

  if (got >= need) return { decision: "accept", ratio, reason: giveUp === 0 ? "白送的我們收下。" : `成交。${style}` };

  if (ratio >= 0.7) {
    // Ask for the cheapest extra asset that closes the gap and keeps the trade legal.
    const userId = ctx.league.userTeamId;
    const inDeal = new Set(offer.give.map((a) => (a.kind === "player" ? a.playerId : a.pickId)));
    const candidates = [
      ...[...ctx.players.values()].filter((p) => p.teamId === userId && !inDeal.has(p.id)).map((p): TradeAsset => ({ kind: "player", playerId: p.id })),
      ...tradablePicks(ctx, userId).filter((p) => !inDeal.has(p.id)).map((p): TradeAsset => ({ kind: "pick", pickId: p.id })),
    ]
      .map((a) => ({ a, v: assetValue(ctx, a, strategy) }))
      .filter((x) => x.v > 0)
      .sort((x, y) => x.v - y.v);
    for (const { a } of candidates) {
      const next: TradeOffer = { ...offer, give: [...offer.give, a] };
      if (receive(next.give) >= need && tradeProblems(ctx, next).length === 0) {
        return { decision: "counter", ratio, counter: next, reason: `差一點。再加上 ${assetLabel(ctx, a)} 就成交。${style}` };
      }
    }
  }
  if (got < 0) return { decision: "reject", ratio, reason: "我們不想接下這份合約，它比球員本身的價值還貴。" };
  return { decision: "reject", ratio, reason: `差太多了，我們覺得拿到的只有付出的 ${Math.round(Math.max(0, ratio) * 100)}%。${style}` };
}

/** Re-checks everything, then moves players, contracts and picks in one transaction. */
export async function executeTrade(db: SaveDb, leagueId: string, offer: TradeOffer): Promise<string> {
  const ctx = await loadTradeContext(db, leagueId);
  const problems = tradeProblems(ctx, offer);
  if (problems.length) throw new Error(problems[0]);
  const verdict = evaluateTrade(ctx, offer);
  if (verdict.decision !== "accept") throw new Error(verdict.reason);

  const { league } = ctx;
  const userId = league.userTeamId;
  const partner = ctx.teams.get(offer.partnerId)!;
  const move = (as: TradeAsset[], to: string) => ({
    players: as.filter((a): a is Extract<TradeAsset, { kind: "player" }> => a.kind === "player").map((a) => ({ ...ctx.players.get(a.playerId)!, teamId: to })),
    picks: as.filter((a): a is Extract<TradeAsset, { kind: "pick" }> => a.kind === "pick").map((a) => ({ ...ctx.picks.get(a.pickId)!, ownerTeamId: to })),
  });
  const toPartner = move(offer.give, partner.id), toUser = move(offer.get, userId);
  const moved = new Map([...toPartner.players, ...toUser.players].map((p) => [p.id, p.teamId]));
  const contracts = ctx.contracts
    .filter((c) => moved.has(c.playerId) && c.type !== "released" && c.endSeason >= league.season)
    .map((c) => ({ ...c, teamId: moved.get(c.playerId)! }));

  const rosterAfter = (teamId: string) => [...ctx.players.values()]
    .map((p) => (moved.has(p.id) ? { ...p, teamId: moved.get(p.id)! } : p))
    .filter((p) => p.teamId === teamId);
  const user = ctx.teams.get(userId)!;
  const teams: Team[] = [
    { ...partner, rotation: autoRotation(rosterAfter(partner.id)) },
    { ...user, rotation: { ...autoRotation(rosterAfter(userId)), tactics: user.rotation.tactics } },
  ];
  const trade: Trade = {
    id: crypto.randomUUID(), leagueId, season: league.season, day: league.day,
    teamA: userId, teamB: partner.id, assetsA: offer.give, assetsB: offer.get, status: "accepted", reason: verdict.reason,
  };
  const text = `與 ${partner.city} ${partner.name} 完成交易：送出 ${offer.give.map((a) => assetLabel(ctx, a)).join("、") || "無"}；得到 ${offer.get.map((a) => assetLabel(ctx, a)).join("、") || "無"}。輪替已自動重排。`;

  await db.transaction("rw", [db.players, db.contracts, db.draftPicks, db.teams, db.trades, db.events], async () => {
    // Nothing may have changed hands since the offer was checked.
    for (const a of [...offer.give, ...offer.get]) {
      if (a.kind === "player") {
        const p = await db.players.get(a.playerId);
        const from = offer.give.includes(a) ? userId : partner.id;
        if (p?.teamId !== from) throw new Error("交易內容已經改變，請重新確認");
      }
    }
    await db.players.bulkPut([...toPartner.players, ...toUser.players]);
    await db.draftPicks.bulkPut([...toPartner.picks, ...toUser.picks]);
    await db.contracts.bulkPut(contracts);
    await db.teams.bulkPut(teams);
    await db.trades.add(trade);
    await db.events.add(newEvent(league, "trade_offer", { text }));
  });
  return trade.id;
}

export const describeSalary = (ctx: TradeContext, as: TradeAsset[]) => fmtMoney(as.reduce((n, a) => n + assetSalary(ctx, a), 0));
export const isFreeAgent = (p: Player) => p.teamId === FREE_AGENT;
