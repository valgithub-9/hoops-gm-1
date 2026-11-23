/// <reference lib="webworker" />
// Runs league creation and simulation off the main thread so the UI never freezes.
import { db } from "../db";
import { advance, createLeague, type AdvanceUntil, type NewLeagueOptions } from "../data/league";

export type WorkerRequest =
  | { id: number; fn: "createLeague"; args: NewLeagueOptions }
  | { id: number; fn: "advance"; args: { leagueId: string; until: AdvanceUntil } }
  | { id: number; fn: "cancel" };

export type WorkerMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: { day: number; lastDay: number } };

let cancelled = false;
const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.fn === "cancel") { cancelled = true; post({ id: req.id, ok: true, result: null }); return; }
    if (req.fn === "createLeague") { post({ id: req.id, ok: true, result: await createLeague(db, req.args) }); return; }
    if (req.fn === "advance") {
      cancelled = false;
      // Web Locks: one advance per save at a time, even across tabs.
      const run = () => advance(db, req.args.leagueId, req.args.until, (progress) => post({ id: req.id, progress }), () => cancelled);
      const result = navigator.locks ? await navigator.locks.request(`league:${req.args.leagueId}`, run) : await run();
      post({ id: req.id, ok: true, result });
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
