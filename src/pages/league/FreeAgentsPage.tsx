import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, Stat } from "../../components/ui/Card";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Field, Input, Select } from "../../components/ui/Field";
import { Ovr } from "../../components/ui/RatingBar";
import { scoutedPotential } from "../../data/draft";
import { askFor, expiring, extendContract, judgeOffer, signFreeAgent, type Ask } from "../../data/freeAgency";
import { MAX_SALARY } from "../../data/league";
import { useMarket } from "../../data/queries";
import { capSeason } from "../../data/trade";
import { ACTIVE, db, FREE_AGENT, type Player } from "../../db";
import { fmtMoney, payroll, signingProblems, signingWindow } from "../../rules/cap";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

type Mode = { kind: "sign" | "extend"; player: Player; ask: Ask };

function OfferDialog({ mode, onClose, payrollNow, rosterNow }: { mode: Mode; onClose: () => void; payrollNow: number; rosterNow: number }) {
  const { league } = useLeague();
  const navigate = useNavigate();
  const [years, setYears] = useState(mode.ask.years);
  const [salaryM, setSalaryM] = useState((mode.ask.salary / 1000).toFixed(2));
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const salary = Math.round(parseFloat(salaryM || "0") * 1000 / 10) * 10;
  const p = mode.player;
  const rules = mode.kind === "sign" ? signingProblems(payrollNow, salary, rosterNow, league) : [];
  const range = salary < league.settings.minSalary || salary > MAX_SALARY ? tr(`年薪要在 ${fmtMoney(league.settings.minSalary)} 到 ${fmtMoney(MAX_SALARY)} 之間`, `Salary must be between ${fmtMoney(league.settings.minSalary)} and ${fmtMoney(MAX_SALARY)}`) : null;
  const preview = judgeOffer(mode.ask, { salary, years });
  const submit = async () => {
    setBusy(true); setResult(undefined);
    try {
      const r = mode.kind === "sign"
        ? await signFreeAgent(db, league.id, p.id, { salary, years })
        : await extendContract(db, league.id, p.id, { salary, years });
      setResult({ ok: r.accepted, text: r.accepted ? tr(`${p.firstName} ${p.lastName} 答應了！`, `${p.firstName} ${p.lastName} said yes!`) : r.reason });
    } catch (e) { setResult({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-pop">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-lg uppercase">{mode.kind === "sign" ? tr("簽約", "Sign") : tr("續約", "Extend")}{tr("：", ": ")}{p.firstName} {p.lastName}</Dialog.Title>
            <Dialog.Close className="rounded-sm p-1 text-text-muted hover:text-text" aria-label={tr("關閉", "Close")}><X className="size-4" /></Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-text-muted">
            {tr(`他要價每年 ${fmtMoney(mode.ask.salary)}、${mode.ask.years} 年左右。`, `He asks for ${fmtMoney(mode.ask.salary)} a year for about ${mode.ask.years} years. `)}{mode.kind === "extend" ? tr("續約不受薪資上限限制，新合約從下一季開始。", "Extensions are allowed over the cap; the new deal starts next season.") : capSeason(league) > league.season ? tr("現在是休賽季，合約從下一季開始。", "It is the offseason, so the deal starts next season.") : ""}
          </Dialog.Description>
          {result?.ok ? (
            <div className="mt-4 space-y-4">
              <p className="text-success" role="status">{result.text}</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => navigate(`/l/${league.id}/rotation`)}>{tr("安排輪替", "Set rotation")}</Button>
                <Button onClick={onClose}>{tr("完成", "Done")}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={tr("年數", "Years")}>{(f) => (
                  <Select id={f.id} value={years} onChange={(e) => setYears(+e.target.value)}>
                    {Array.from({ length: league.settings.maxContractYears }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{tr(`${y} 年`, `${y} ${y === 1 ? "year" : "years"}`)}</option>)}
                  </Select>
                )}</Field>
                <Field label={tr("每年薪資（百萬）", "Salary per year ($M)")} error={range ?? undefined}>{(f) => (
                  <Input id={f.id} type="number" inputMode="decimal" step="0.1" min={league.settings.minSalary / 1000} max={MAX_SALARY / 1000}
                    value={salaryM} onChange={(e) => setSalaryM(e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />
                )}</Field>
              </div>
              {rules.map((r) => <p key={r} className="text-sm text-warning">{r}</p>)}
              {!range && rules.length === 0 && (
                <p className={preview.accepted ? "text-sm text-success" : "text-sm text-text-muted"}>{preview.accepted ? tr("這個條件他應該會答應。", "He should accept this.") : preview.reason}</p>
              )}
              {result && !result.ok && <p className="text-sm text-danger" role="alert">{result.text}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>{tr("取消", "Cancel")}</Button>
                <Button loading={busy} disabled={!!range || rules.length > 0} onClick={submit}>{tr("送出報價", "Make offer")}</Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// S15
function FreeAgents() {
  const { league, userTeam } = useLeague();
  const ctx = useMarket(league.id);
  const [mode, setMode] = useState<Mode | null>(null);
  if (!ctx) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入自由市場", "Loading free agency")} />;
  const season = capSeason(league);
  const all = [...ctx.players.values()];
  const roster = all.filter((p) => p.teamId === userTeam.id);
  const fas = all.filter((p) => p.teamId === FREE_AGENT && !p.isProspect && p.retiredSeason === ACTIVE);
  const pay = payroll(ctx.contracts, userTeam.id, season);
  const space = league.settings.salaryCap - pay;
  const closed = signingWindow(league);
  const ending = league.phase !== "playoffs" ? expiring(ctx.contracts, roster, league.season) : [];
  const age = (p: Player) => season - p.bornYear;

  const cols: Column<Player>[] = [
    { key: "name", header: tr("球員", "Player"), sticky: true, sortValue: (p) => p.lastName,
      cell: (p) => <Link to={`/l/${league.id}/player/${p.id}`} className="font-medium hover:text-accent-text">{p.firstName} {p.lastName}</Link> },
    { key: "pos", header: tr("位置", "Pos"), cell: (p) => p.position },
    { key: "age", header: tr("年齡", "Age"), numeric: true, cell: age, sortValue: age },
    { key: "ovr", header: tr("總評", "Ovr"), numeric: true, cell: (p) => <Ovr value={p.overall} size="sm" />, sortValue: (p) => p.overall },
    { key: "pot", header: tr("潛力（估）", "Potential (est.)"), numeric: true, cell: (p) => (age(p) >= 27 ? "—" : scoutedPotential(p).join("–")) },
    { key: "ask", header: tr("要價", "Asking"), numeric: true, sortValue: (p) => askFor(p, league).salary,
      cell: (p) => { const a = askFor(p, league); return tr(`${fmtMoney(a.salary)} × ${a.years} 年`, `${fmtMoney(a.salary)} × ${a.years}y`); } },
    { key: "act", header: "", cell: (p) => (
      <Button size="sm" disabled={!!closed} onClick={() => setMode({ kind: "sign", player: p, ask: askFor(p, league) })} aria-label={tr(`向 ${p.firstName} ${p.lastName} 報價`, `Make an offer to ${p.firstName} ${p.lastName}`)}>{tr("報價", "Offer")}</Button>
    ) },
  ];

  return (
    <div className="space-y-6">
      {closed && <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning" role="status">{closed}。</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={tr(`${season} 總薪資`, `${season} payroll`)} value={fmtMoney(pay)} sub={tr(`上限 ${fmtMoney(league.settings.salaryCap)}`, `Cap ${fmtMoney(league.settings.salaryCap)}`)} />
        <Stat label={tr("薪資空間", "Cap space")} value={fmtMoney(space)} tone={space < 0 ? "danger" : "success"} sub={space < 0 ? tr("超過上限：只能簽底薪", "Over the cap: minimum deals only") : tr("可以簽任何人", "You can sign anyone")} />
        <Stat label={tr("名單", "Roster")} value={`${roster.length} / ${league.settings.rosterMax}`} tone={roster.length < league.settings.rosterMin ? "danger" : undefined}
          sub={roster.length < league.settings.rosterMin ? tr(`至少要 ${league.settings.rosterMin} 人才能開賽`, `You need ${league.settings.rosterMin} to play`) : tr(`最少 ${league.settings.rosterMin} 人`, `Minimum ${league.settings.rosterMin}`)} />
        <Stat label={tr("自由球員", "Free agents")} value={fas.length} sub={tr(`底薪 ${fmtMoney(league.settings.minSalary)}`, `Minimum ${fmtMoney(league.settings.minSalary)}`)} />
      </div>

      {ending.length > 0 && (
        <Card title={tr(`${league.season} 年底到期的合約`, `Contracts ending after ${league.season}`)}>
          <p className="mb-3 text-sm text-text-muted">{tr("沒續約的球員在新球季開始時會變成自由球員。續約不受薪資上限限制。", "Players you do not extend become free agents when the new season starts. Extensions are allowed over the cap.")}</p>
          <ul className="-mx-2">
            {ending.sort((a, b) => b.overall - a.overall).map((p) => {
              const ask = askFor(p, league, 0.95);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-md px-2 min-h-[48px] hover:bg-surface-raised">
                  <Ovr value={p.overall} size="sm" />
                  <Link to={`/l/${league.id}/player/${p.id}`} className="flex-1 min-w-0 truncate font-medium hover:text-accent-text">{p.firstName} {p.lastName}</Link>
                  <span className="num hidden sm:inline font-mono text-xs text-text-muted">{tr(`要價 ${fmtMoney(ask.salary)} × ${ask.years} 年`, `Asks ${fmtMoney(ask.salary)} × ${ask.years}y`)}</span>
                  <Button size="sm" variant="secondary" onClick={() => setMode({ kind: "extend", player: p, ask })}>{tr("續約", "Extend")}</Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-lg uppercase">{tr("自由球員", "Free agents")} {space < 0 && <Badge tone="warning" className="ml-2 align-middle">{tr("超過上限：只能簽底薪", "Over the cap: minimum deals only")}</Badge>}</h2>
        <DataTable caption={tr("自由球員", "Free agents")} rows={fas} columns={cols} rowKey={(p) => p.id} initialSort={{ key: "ovr", dir: "desc" }} empty={tr("目前沒有自由球員。", "No free agents right now.")} />
      </section>
      {mode && <OfferDialog mode={mode} onClose={() => setMode(null)} payrollNow={pay} rosterNow={roster.length} />}
    </div>
  );
}

export function FreeAgentsPage() {
  return <LeagueShell title={tr("自由市場", "Free Agency")}><FreeAgents /></LeagueShell>;
}
