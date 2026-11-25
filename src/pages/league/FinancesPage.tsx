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
import { tr } from "../../i18n";

// S16
function Finances() {
  const { league, userTeam } = useLeague();
  const ctx = useMarket(league.id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  if (!ctx) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入財務", "Loading finances")} />;
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
    try { await releasePlayer(db, league.id, id); setMsg({ ok: true, text: tr(`已釋出 ${name}。`, `Released ${name}.`) }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={tr(`${first} 總薪資`, `${first} payroll`)} value={fmtMoney(totals[0])} sub={tr(`上限 ${fmtMoney(cap)}`, `Cap ${fmtMoney(cap)}`)} />
        <Stat label={tr("薪資空間", "Cap space")} value={fmtMoney(cap - totals[0])} tone={cap - totals[0] < 0 ? "danger" : "success"} />
        <Stat label={tr("奢侈稅線", "Luxury tax line")} value={fmtMoney(tax)} tone={totals[0] > tax ? "danger" : undefined} sub={totals[0] > tax ? tr("已超過奢侈稅線", "Over the tax line") : tr(`還差 ${fmtMoney(tax - totals[0])}`, `${fmtMoney(tax - totals[0])} below it`)} />
        <Stat label={tr("已釋出球員的薪資", "Released players' salary")} value={fmtMoney(dead)} tone={dead > 0 ? "danger" : undefined} sub={tr("仍算在總薪資裡", "Still counts against payroll")} />
      </div>
      {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{tr("未來五季薪資", "Payroll for the next five seasons")}</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-surface h-[36px] px-3 text-left">{tr("球員", "Player")}</th>
              {seasons.map((s) => <th key={s} scope="col" className="px-3 text-right">{s}</th>)}
              <th scope="col" className="px-3"><span className="sr-only">{tr("動作", "Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const name = `${r.player.firstName} ${r.player.lastName}`;
              return (
                <tr key={r.player.id} className="border-b border-border">
                  <td className="sticky left-0 z-10 bg-surface px-3 h-[44px] whitespace-nowrap">
                    <Link to={`/l/${league.id}/player/${r.player.id}`} className={cn("font-medium hover:text-accent-text", r.released && "text-text-muted")}>{name}</Link>
                    {r.released && <Badge tone="danger" className="ml-2">{tr("已釋出", "Released")}</Badge>}
                    {r.contracts.some((c) => c.type === "rookie") && <Badge tone="info" className="ml-2">{tr("新秀約", "Rookie deal")}</Badge>}
                  </td>
                  {seasons.map((s) => {
                    const v = r.salaryIn(s);
                    return <td key={s} className="num px-3 text-right font-mono whitespace-nowrap">{v ? fmtMoney(v) : <span className="text-text-subtle">—</span>}</td>;
                  })}
                  <td className="px-3 text-right">
                    {!r.released && canRelease && (
                      <Modal trigger={<Button size="sm" variant="ghost" aria-label={tr(`釋出 ${name}`, `Release ${name}`)}>{tr("釋出", "Release")}</Button>}
                        title={tr(`釋出 ${name}？`, `Release ${name}?`)}
                        description={tr(`他會成為自由球員，但剩下的合約（${seasons.filter((s) => r.salaryIn(s)).map((s) => `${s} ${fmtMoney(r.salaryIn(s))}`).join("、")}）仍要付，會繼續算在你的總薪資裡。`, `He becomes a free agent, but you still pay the rest of his contract (${seasons.filter((s) => r.salaryIn(s)).map((s) => `${s} ${fmtMoney(r.salaryIn(s))}`).join(", ")}), and it keeps counting against your payroll.`)}
                        footer={<>
                          <ModalClose asChild><Button variant="secondary">{tr("取消", "Cancel")}</Button></ModalClose>
                          <ModalClose asChild><Button variant="danger" onClick={() => release(r.player.id, name)}>{tr("釋出", "Release")}</Button></ModalClose>
                        </>} />
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-surface px-3 h-[44px]">{tr("合計", "Total")}</td>
              {totals.map((t, i) => (
                <td key={seasons[i]} className={cn("num px-3 text-right font-mono", t > cap ? "text-danger" : "text-success")}>{fmtMoney(t)}</td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-subtle">{tr(`綠色合計表示在薪資上限 ${fmtMoney(cap)} 以內，紅色表示超過；超過上限時只能簽底薪球員，交易時收進的薪資最多是送出的 125%。`, `A green total is under the ${fmtMoney(cap)} cap, red is over it. Over the cap you can only sign minimum deals, and in trades you can take back at most 125% of the salary you send.`)}</p>
    </div>
  );
}

export function FinancesPage() {
  return <LeagueShell title={tr("財務", "Finances")}><Finances /></LeagueShell>;
}
