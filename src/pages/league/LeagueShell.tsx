import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight, Award, BarChart3, CalendarDays, CircleDollarSign, History, LayoutDashboard, ListOrdered, Shuffle, SkipForward,
  Trophy, UserPlus, Users, Vote,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { AppShell, type NavItem } from "../../components/ui/AppShell";
import { AdvanceMenu, type AdvanceOption } from "../../components/ui/AdvanceMenu";
import { Toast } from "../../components/ui/Toast";
import { useLeagueData, type LeagueData } from "../../data/queries";
import { sim } from "../../worker/client";
import { NotFound } from "../NotFound";

const Ctx = createContext<LeagueData | null>(null);
export const useLeague = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLeague outside LeagueShell");
  return v;
};

const navFor = (id: string): NavItem[] => [
  { to: `/l/${id}/team`, label: "球隊", icon: LayoutDashboard },
  { to: `/l/${id}/roster`, label: "名單", icon: Users },
  { to: `/l/${id}/schedule`, label: "賽程", icon: CalendarDays },
  { to: `/l/${id}/standings`, label: "排名", icon: ListOrdered },
  { to: `/l/${id}/playoffs`, label: "季後賽", icon: Trophy },
  { to: `/l/${id}/rotation`, label: "輪替", icon: Shuffle },
  { to: `/l/${id}/draft`, label: "選秀", icon: Vote },
  { to: `/l/${id}/awards`, label: "獎項", icon: Award },
  { to: `/l/${id}/history`, label: "歷史", icon: History },
  { to: `/l/${id}/trade`, label: "交易", icon: ArrowLeftRight },
  { to: `/l/${id}/leaders`, label: "數據排行", icon: BarChart3 },
  { to: `/l/${id}/free-agents`, label: "自由市場", icon: UserPlus },
  { to: `/l/${id}/finances`, label: "財務", icon: CircleDollarSign },
];

type ToastState = { tone: "success" | "warning" | "error"; title: string; body?: string } | null;

export function LeagueShell({ title, children }: { title: string; children: ReactNode }) {
  const { leagueId } = useParams();
  const data = useLeagueData(leagueId);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<number>();

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer.current);
  }, [toast]);

  if (data === undefined) return <div className="p-6 text-text-muted" role="status">載入存檔中…</div>;
  if (data === null) return <NotFound what="找不到這份存檔" />;

  const { league, userTeam, lastDay, phaseDone, problems } = data;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setProgress(undefined);
    try { await fn(); } catch (e) {
      setToast({ tone: "error", title: "沒有完成", body: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); setProgress(undefined); }
  };

  const onAdvance = (until: AdvanceOption) => run(async () => {
    const r = await sim.advance(league.id, until, (p) =>
      setProgress(league.phase === "playoffs" ? `季後賽第 ${p.day - lastDay} 天` : `第 ${p.day} / ${p.lastDay} 天`));
    setToast(r.phaseOver
      ? { tone: "success", title: league.phase === "playoffs" ? "季後賽結束" : "例行賽結束", body: league.phase === "playoffs" ? "看看總冠軍和年度獎項，然後前往選秀。" : "可以開始季後賽了。" }
      : { tone: "success", title: `推進了 ${r.daysPlayed} 天`, body: `模擬 ${r.gamesPlayed} 場比賽，用時 ${(r.ms / 1000).toFixed(1)} 秒。` });
  });

  const step = (to: string, toast: ToastState) => run(async () => {
    await sim.nextPhase(league.id);
    setToast(toast);
    navigate(`/l/${league.id}/${to}`);
  });

  const phaseLabel = league.phase === "regular" ? `第 ${Math.min(league.day + 1, lastDay)} / ${lastDay} 天`
    : league.phase === "playoffs" ? "季後賽" : league.phase === "draft" ? "選秀" : "休賽季";

  let action: ReactNode;
  const rosterShort = problems.some((p) => p.includes("名單"));
  if (rosterShort && (league.phase === "regular" || league.phase === "playoffs") && !phaseDone) {
    action = <Button variant="secondary" onClick={() => navigate(`/l/${league.id}/free-agents`)} title={problems[0]}>
      <UserPlus className="size-4" aria-hidden />補齊名單</Button>;
  } else if (league.phase === "regular" && !phaseDone) {
    action = <AdvanceMenu busy={busy} progress={progress} onAdvance={onAdvance} onCancel={() => sim.cancel()}
      blockedReason={problems[0]} inHeader />;
  } else if (league.phase === "regular") {
    action = <Button loading={busy} onClick={() => step("playoffs", { tone: "success", title: "季後賽開打" })}>
      <SkipForward className="size-4" aria-hidden />開始季後賽</Button>;
  } else if (league.phase === "playoffs" && !phaseDone) {
    action = <AdvanceMenu busy={busy} progress={progress} onAdvance={onAdvance} onCancel={() => sim.cancel()}
      blockedReason={problems[0]} inHeader
      options={[{ id: "day", label: "打一天" }, { id: "phaseEnd", label: "打完季後賽" }]} />;
  } else if (league.phase === "playoffs") {
    action = <Button loading={busy} onClick={() => step("draft", { tone: "success", title: "選秀開始", body: "最差戰績的球隊先選。" })}>
      <SkipForward className="size-4" aria-hidden />前往選秀</Button>;
  } else if (league.phase === "draft" && !phaseDone) {
    action = <Button onClick={() => navigate(`/l/${league.id}/draft`)}><Vote className="size-4" aria-hidden />選秀會場</Button>;
  } else {
    action = <Button loading={busy} onClick={() => step("team", { tone: "success", title: `${league.season + 1} 球季開始`, body: "看看收件匣：續約、退休和名單變動都在那裡。" })}>
      <SkipForward className="size-4" aria-hidden />開始新球季</Button>;
  }

  return (
    <Ctx.Provider value={data}>
      <AppShell
        title={title}
        subtitle={`${userTeam.city} ${userTeam.name} · ${league.season} 球季 · ${phaseLabel}`}
        nav={navFor(league.id)}
        actions={action}
      >
        {children}
      </AppShell>
      {toast && (
        <div className="fixed z-50 right-4 left-4 sm:left-auto bottom-[80px] lg:bottom-4 flex justify-end">
          <Toast tone={toast.tone} title={toast.title}>{toast.body}</Toast>
        </div>
      )}
    </Ctx.Provider>
  );
}
