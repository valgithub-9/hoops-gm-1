/// <reference lib="webworker" />
// Runs league creation, simulation and the offseason off the main thread so the UI never freezes.
import { db } from "../db";
import { advance } from "../data/advance";
import { autoDraft, draftPlayer } from "../data/draft";
import { createLeague, type AdvanceUntil, type NewLeagueOptions } from "../data/league";
import { nextPhase } from "../data/offseason";

export type WorkerRequest =
  | { id: number; fn: "createLeague"; args: NewLeagueOptions }
  | { id: number; fn: "advance"; args: { leagueId: string; until: AdvanceUntil } }
  | { id: number; fn: "nextPhase"; args: { leagueId: string } }
  | { id: number; fn: "autoDraft"; args: { leagueId: string; mode: "untilUser" | "all" } }
  | { id: number; fn: "draftPlayer"; args: { leagueId: string; playerId: string } }
  | { id: number; fn: "cancel" };

export type WorkerMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: { day: number; lastDay: number } };

let cancelled = false;
const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

/** Web Locks: one writer per save at a time, even across tabs. */
const locked = <T,>(leagueId: string, fn: () => Promise<T>): Promise<T> =>
  navigator.locks ? (navigator.locks.request(`league:${leagueId}`, fn) as Promise<T>) : fn();

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    let result: unknown = null;
    switch (req.fn) {
      case "cancel": cancelled = true; break;
      case "createLeague": result = await createLeague(db, req.args); break;
      case "advance": {
        cancelled = false;
        const { leagueId, until } = req.args;
        result = await locked(leagueId, () =>
          advance(db, leagueId, until, (progress) => post({ id: req.id, progress }), () => cancelled));
        break;
      }
      case "nextPhase": result = await locked(req.args.leagueId, () => nextPhase(db, req.args.leagueId)); break;
      case "autoDraft": result = await locked(req.args.leagueId, () => autoDraft(db, req.args.leagueId, req.args.mode)); break;
      case "draftPlayer": result = await locked(req.args.leagueId, () => draftPlayer(db, req.args.leagueId, req.args.playerId)); break;
    }
    post({ id: req.id, ok: true, result });
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
