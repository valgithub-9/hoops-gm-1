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
import { tr } from "../../i18n";

const Ctx = createContext<LeagueData | null>(null);
export const useLeague = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLeague outside LeagueShell");
  return v;
};

const navFor = (id: string): NavItem[] => [
  { to: `/l/${id}/team`, label: tr("球隊", "Team"), icon: LayoutDashboard },
  { to: `/l/${id}/roster`, label: tr("名單", "Roster"), icon: Users },
  { to: `/l/${id}/schedule`, label: tr("賽程", "Schedule"), icon: CalendarDays },
  { to: `/l/${id}/standings`, label: tr("排名", "Standings"), icon: ListOrdered },
  { to: `/l/${id}/playoffs`, label: tr("季後賽", "Playoffs"), icon: Trophy },
  { to: `/l/${id}/rotation`, label: tr("輪替", "Rotation"), icon: Shuffle },
  { to: `/l/${id}/draft`, label: tr("選秀", "Draft"), icon: Vote },
  { to: `/l/${id}/awards`, label: tr("獎項", "Awards"), icon: Award },
  { to: `/l/${id}/history`, label: tr("歷史", "History"), icon: History },
  { to: `/l/${id}/trade`, label: tr("交易", "Trade"), icon: ArrowLeftRight },
  { to: `/l/${id}/leaders`, label: tr("數據排行", "Leaders"), icon: BarChart3 },
  { to: `/l/${id}/free-agents`, label: tr("自由市場", "Free Agency"), icon: UserPlus },
  { to: `/l/${id}/finances`, label: tr("財務", "Finances"), icon: CircleDollarSign },
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
    timer.current = window.setTimeout(() => setToast(null), toast.tone === "success" ? 4000 : 9000);
    return () => window.clearTimeout(timer.current);
  }, [toast]);

  if (data === undefined) return <div className="p-6 text-text-muted" role="status">{tr("載入存檔中…", "Loading save…")}</div>;
  if (data === null) return <NotFound what={tr("找不到這份存檔", "Save not found")} />;

  const { league, userTeam, lastDay, phaseDone, problems } = data;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setProgress(undefined);
    try { await fn(); } catch (e) {
      setToast({ tone: "error", title: tr("沒有完成", "That did not work"), body: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); setProgress(undefined); }
  };

  const onAdvance = (until: AdvanceOption) => run(async () => {
    const r = await sim.advance(league.id, until, (p) =>
      setProgress(league.phase === "playoffs" ? tr(`季後賽第 ${p.day - lastDay} 天`, `Playoffs day ${p.day - lastDay}`) : tr(`第 ${p.day} / ${p.lastDay} 天`, `Day ${p.day} / ${p.lastDay}`)));
    setToast(r.paused
      ? { tone: "warning", title: r.paused.reason === "deadline" ? tr("交易截止日", "Trade deadline") : tr("推進已暫停", "Paused"), body: r.paused.message }
      : r.phaseOver
        ? { tone: "success", title: league.phase === "playoffs" ? tr("季後賽結束", "Playoffs over") : tr("例行賽結束", "Regular season over"), body: league.phase === "playoffs" ? tr("看看總冠軍和年度獎項，然後前往選秀。", "See the champion and the awards, then go to the draft.") : tr("可以開始季後賽了。", "The playoffs can start.") }
        : { tone: "success", title: tr(`推進了 ${r.daysPlayed} 天`, `Played ${r.daysPlayed} ${r.daysPlayed === 1 ? "day" : "days"}`), body: tr(`模擬 ${r.gamesPlayed} 場比賽，用時 ${(r.ms / 1000).toFixed(1)} 秒。`, `Simulated ${r.gamesPlayed} games in ${(r.ms / 1000).toFixed(1)} s.`) });
  });

  const step = (to: string, toast: ToastState) => run(async () => {
    await sim.nextPhase(league.id);
    setToast(toast);
    navigate(`/l/${league.id}/${to}`);
  });

  const phaseLabel = league.phase === "regular" ? tr(`第 ${Math.min(league.day + 1, lastDay)} / ${lastDay} 天`, `Day ${Math.min(league.day + 1, lastDay)} / ${lastDay}`)
    : league.phase === "playoffs" ? tr("季後賽", "Playoffs") : league.phase === "draft" ? tr("選秀", "Draft") : tr("休賽季", "Offseason");

  let action: ReactNode;
  const rosterShort = problems.some((p) => /名單|roster/i.test(p));
  if (rosterShort && (league.phase === "regular" || league.phase === "playoffs") && !phaseDone) {
    action = <Button variant="secondary" onClick={() => navigate(`/l/${league.id}/free-agents`)} title={problems[0]}>
      <UserPlus className="size-4" aria-hidden />{tr("補齊名單", "Fill roster")}</Button>;
  } else if (league.phase === "regular" && !phaseDone) {
    const beforeDeadline = league.day < league.settings.tradeDeadlineDay;
    action = <AdvanceMenu busy={busy} progress={progress} onAdvance={onAdvance} onCancel={() => sim.cancel()}
      blockedReason={problems[0]} inHeader
      options={[
        { id: "day", label: tr("推進一天", "Play a day") },
        { id: "week", label: tr("推進一週", "Play a week") },
        ...(beforeDeadline ? [{ id: "deadline" as const, label: tr(`到交易截止日（第 ${league.settings.tradeDeadlineDay + 1} 天）`, `To the trade deadline (day ${league.settings.tradeDeadlineDay + 1})`) }] : []),
        { id: "phaseEnd", label: tr("到例行賽結束", "To end of regular season") },
      ]} />;
  } else if (league.phase === "regular") {
    action = <Button loading={busy} onClick={() => step("playoffs", { tone: "success", title: tr("季後賽開打", "The playoffs are on") })}>
      <SkipForward className="size-4" aria-hidden />{tr("開始季後賽", "Start playoffs")}</Button>;
  } else if (league.phase === "playoffs" && !phaseDone) {
    action = <AdvanceMenu busy={busy} progress={progress} onAdvance={onAdvance} onCancel={() => sim.cancel()}
      blockedReason={problems[0]} inHeader
      options={[{ id: "day", label: tr("打一天", "Play a day") }, { id: "phaseEnd", label: tr("打完季後賽", "Finish the playoffs") }]} />;
  } else if (league.phase === "playoffs") {
    action = <Button loading={busy} onClick={() => step("draft", { tone: "success", title: tr("選秀開始", "The draft is on"), body: tr("最差戰績的球隊先選。", "The worst record picks first.") })}>
      <SkipForward className="size-4" aria-hidden />{tr("前往選秀", "Go to the draft")}</Button>;
  } else if (league.phase === "draft" && !phaseDone) {
    action = <Button onClick={() => navigate(`/l/${league.id}/draft`)}><Vote className="size-4" aria-hidden />{tr("選秀會場", "Draft room")}</Button>;
  } else {
    action = <Button loading={busy} onClick={() => step("team", { tone: "success", title: tr(`${league.season + 1} 球季開始`, `The ${league.season + 1} season begins`), body: tr("看看收件匣：續約、退休和名單變動都在那裡。", "Check the inbox for re-signings, retirements and roster changes.") })}>
      <SkipForward className="size-4" aria-hidden />{tr("開始新球季", "Start new season")}</Button>;
  }

  return (
    <Ctx.Provider value={data}>
      <AppShell
        title={title}
        subtitle={`${userTeam.city} ${userTeam.name} · ${tr(`${league.season} 球季`, `${league.season} season`)} · ${phaseLabel}`}
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
