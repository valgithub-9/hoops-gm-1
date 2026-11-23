import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Stat } from "../../components/ui/Card";
import { Modal, ModalClose } from "../../components/ui/Modal";
import { releasePlayer } from "../../data/freeAgency";
import { useMarket } from "../../data/queries";
import { capSeason } from "../../data/trade";
import { db, type Contract } from "../../db";
import { fmtMoney, payroll } from "../../rules/cap";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

// S16
function Finances() {
  const { league, userTeam } = useLeague();
  const ctx = useMarket(league.id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  if (!ctx) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入財務" />;
  const first = capSeason(league);
  const seasons = Array.from({ length: 5 }, (_, i) => first + i);
  const mine = ctx.contracts.filter((c) => c.teamId === userTeam.id && c.endSeason >= first);
  const byPlayer = new Map<string, Contract[]>();
  for (const c of mine) (byPlayer.get(c.playerId) ?? byPlayer.set(c.playerId, []).get(c.playerId)!).push(c);
  const rows = [...byPlayer.entries()].map(([playerId, cs]) => ({
    player: ctx.players.get(playerId)!, contracts: cs,
    released: cs.every((c) => c.type === "released"),
    salaryIn: (s: number) => cs.filter((c) => c.startSeason <= s && c.endSeason >= s).reduce((n, c) => n + c.salaryPerYear, 0),
  })).sort((a, b) => Number(a.released) - Number(b.released) || b.salaryIn(first) - a.salaryIn(first));
  const totals = seasons.map((s) => payroll(ctx.contracts, userTeam.id, s));
  const { salaryCap: cap, luxuryTax: tax } = league.settings;
  const dead = rows.filter((r) => r.released).reduce((n, r) => n + r.salaryIn(first), 0);
  const canRelease = league.phase !== "playoffs";

  const release = async (id: string, name: string) => {
    try { await releasePlayer(db, league.id, id); setMsg({ ok: true, text: `已釋出 ${name}。` }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`${first} 總薪資`} value={fmtMoney(totals[0])} sub={`上限 ${fmtMoney(cap)}`} />
        <Stat label="薪資空間" value={fmtMoney(cap - totals[0])} tone={cap - totals[0] < 0 ? "danger" : "success"} />
        <Stat label="奢侈稅線" value={fmtMoney(tax)} tone={totals[0] > tax ? "danger" : undefined} sub={totals[0] > tax ? "已超過奢侈稅線" : `還差 ${fmtMoney(tax - totals[0])}`} />
        <Stat label="已釋出球員的薪資" value={fmtMoney(dead)} tone={dead > 0 ? "danger" : undefined} sub="仍算在總薪資裡" />
      </div>
      {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">未來五季薪資</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-surface h-[36px] px-3 text-left">球員</th>
              {seasons.map((s) => <th key={s} scope="col" className="px-3 text-right">{s}</th>)}
              <th scope="col" className="px-3"><span className="sr-only">動作</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const name = `${r.player.firstName} ${r.player.lastName}`;
              return (
                <tr key={r.player.id} className="border-b border-border">
                  <td className="sticky left-0 z-10 bg-surface px-3 h-[44px] whitespace-nowrap">
                    <Link to={`/l/${league.id}/player/${r.player.id}`} className={cn("font-medium hover:text-accent-text", r.released && "text-text-muted")}>{name}</Link>
                    {r.released && <Badge tone="danger" className="ml-2">已釋出</Badge>}
                    {r.contracts.some((c) => c.type === "rookie") && <Badge tone="info" className="ml-2">新秀約</Badge>}
                  </td>
                  {seasons.map((s) => {
                    const v = r.salaryIn(s);
                    return <td key={s} className="num px-3 text-right font-mono whitespace-nowrap">{v ? fmtMoney(v) : <span className="text-text-subtle">—</span>}</td>;
                  })}
                  <td className="px-3 text-right">
                    {!r.released && canRelease && (
                      <Modal trigger={<Button size="sm" variant="ghost" aria-label={`釋出 ${name}`}>釋出</Button>}
                        title={`釋出 ${name}？`}
                        description={`他會成為自由球員，但剩下的合約（${seasons.filter((s) => r.salaryIn(s)).map((s) => `${s} ${fmtMoney(r.salaryIn(s))}`).join("、")}）仍要付，會繼續算在你的總薪資裡。`}
                        footer={<>
                          <ModalClose asChild><Button variant="secondary">取消</Button></ModalClose>
                          <ModalClose asChild><Button variant="danger" onClick={() => release(r.player.id, name)}>釋出</Button></ModalClose>
                        </>} />
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-surface px-3 h-[44px]">合計</td>
              {totals.map((t, i) => (
                <td key={seasons[i]} className={cn("num px-3 text-right font-mono", t > cap ? "text-danger" : "text-success")}>{fmtMoney(t)}</td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-subtle">綠色合計表示在薪資上限 {fmtMoney(cap)} 以內，紅色表示超過；超過上限時只能簽底薪球員，交易時收進的薪資最多是送出的 125%。</p>
    </div>
  );
}

export function FinancesPage() {
  return <LeagueShell title="財務"><Finances /></LeagueShell>;
}
