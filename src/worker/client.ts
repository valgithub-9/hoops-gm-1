import type { AdvanceResult, AdvanceUntil, NewLeagueOptions } from "../data/league";
import type { WorkerMessage, WorkerRequest } from "./sim.worker";
import { lang } from "../i18n";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: { day: number; lastDay: number }) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Set<() => void>();

/** Bumped whenever the worker writes, so live queries in this tab re-run. */
export let dataVersion = 0;
export const subscribeData = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const bump = () => { dataVersion++; listeners.forEach((f) => f()); };

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      if ("progress" in m) { bump(); p.onProgress?.(m.progress); return; }
      pending.delete(m.id);
      bump();
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
    };
  }
  return worker;
}

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;
function call<T>(req: Req, onProgress?: Pending["onProgress"]): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    getWorker().postMessage({ ...req, id, lang: lang() });
  });
}

export const sim = {
  createLeague: (args: NewLeagueOptions) => call<string>({ fn: "createLeague", args }),
  advance: (leagueId: string, until: AdvanceUntil, onProgress?: Pending["onProgress"]) =>
    call<AdvanceResult>({ fn: "advance", args: { leagueId, until } }, onProgress),
  nextPhase: (leagueId: string) => call<string>({ fn: "nextPhase", args: { leagueId } }),
  autoDraft: (leagueId: string, mode: "untilUser" | "all") => call<number>({ fn: "autoDraft", args: { leagueId, mode } }),
  draftPlayer: (leagueId: string, playerId: string) => call<null>({ fn: "draftPlayer", args: { leagueId, playerId } }),
  cancel: () => call<null>({ fn: "cancel" }),
};
