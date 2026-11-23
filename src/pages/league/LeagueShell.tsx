import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeftRight, BarChart3, CalendarDays, CircleDollarSign, History, LayoutDashboard, ListOrdered, Trophy, UserPlus, Users, Vote,
} from "lucide-react";
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
  { to: `/l/${id}/trade`, label: "交易", icon: ArrowLeftRight },
  { to: `/l/${id}/leaders`, label: "數據排行", icon: BarChart3 },
  { to: `/l/${id}/free-agents`, label: "自由市場", icon: UserPlus },
  { to: `/l/${id}/draft`, label: "選秀", icon: Vote },
  { to: `/l/${id}/finances`, label: "財務", icon: CircleDollarSign },
  { to: `/l/${id}/playoffs`, label: "季後賽", icon: Trophy },
  { to: `/l/${id}/history`, label: "歷史", icon: History },
];

type ToastState = { tone: "success" | "warning" | "error"; title: string; body?: string } | null;

export function LeagueShell({ title, children }: { title: string; children: ReactNode }) {
  const { leagueId } = useParams();
  const data = useLeagueData(leagueId);
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

  const { league, userTeam, lastDay } = data;
  const seasonOver = league.day >= lastDay;

  const onAdvance = async (until: AdvanceOption) => {
    setBusy(true);
    setProgress(undefined);
    try {
      const r = await sim.advance(league.id, until, (p) => setProgress(`第 ${p.day} / ${p.lastDay} 天`));
      setToast(r.seasonOver
        ? { tone: "success", title: "例行賽結束", body: "季後賽、選秀和休賽季會在下個版本加入。" }
        : { tone: "success", title: `推進了 ${r.daysPlayed} 天`, body: `模擬 ${r.gamesPlayed} 場比賽，用時 ${(r.ms / 1000).toFixed(1)} 秒。` });
    } catch (e) {
      setToast({ tone: "error", title: "模擬失敗", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  };

  return (
    <Ctx.Provider value={data}>
      <AppShell
        title={title}
        subtitle={`${userTeam.city} ${userTeam.name} · ${league.season} 球季 · 第 ${Math.min(league.day + 1, lastDay)} / ${lastDay} 天`}
        nav={navFor(league.id)}
        actions={
          <AdvanceMenu busy={busy} progress={progress} onAdvance={onAdvance} onCancel={() => sim.cancel()}
            blockedReason={seasonOver ? "例行賽已結束" : undefined} inHeader />
        }
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
