import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Check, RotateCcw } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, Select } from "../../components/ui/Field";
import { Ovr } from "../../components/ui/RatingBar";
import { TeamChip } from "../../components/ui/TeamChip";
import { TradePanel } from "../../components/ui/TradePanel";
import { useMarket } from "../../data/queries";
import {
  assetLabel, assetSalary, capSeason, evaluateTrade, executeTrade, strategyOf, tradablePicks, tradeProblems,
  type TradeContext, type TradeOffer,
} from "../../data/trade";
import { db, type TradeAsset } from "../../db";
import { currentContract, fmtMoney, payroll, tradeWindow } from "../../rules/cap";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

const key = (a: TradeAsset) => (a.kind === "player" ? `p:${a.playerId}` : `k:${a.pickId}`);

/** Checkbox list of one team's tradable players and picks. */
function AssetPicker({ ctx, teamId, selected, onToggle, title }: {
  ctx: TradeContext; teamId: string; selected: TradeAsset[]; onToggle: (a: TradeAsset) => void; title: string;
}) {
  const season = capSeason(ctx.league);
  const players = [...ctx.players.values()].filter((p) => p.teamId === teamId).sort((a, b) => b.overall - a.overall);
  const picks = tradablePicks(ctx, teamId);
  const on = new Set(selected.map(key));
  const row = (a: TradeAsset, body: React.ReactNode, label: string) => (
    <li key={key(a)}>
      <label className={cn("flex items-center gap-3 rounded-md px-2 min-h-[44px] cursor-pointer hover:bg-surface-raised", on.has(key(a)) && "bg-accent/10")}>
        <input type="checkbox" className="size-4 shrink-0 accent-[rgb(var(--color-accent))]" checked={on.has(key(a))} onChange={() => onToggle(a)} aria-label={label} />
        {body}
      </label>
    </li>
  );
  return (
    <Card title={title}>
      <ul className="-mx-2 max-h-[420px] overflow-y-auto">
        {players.map((p) => {
          const c = currentContract(ctx.contracts, p.id, season);
          const a: TradeAsset = { kind: "player", playerId: p.id };
          return row(a, (
            <>
              <Ovr value={p.overall} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.firstName} {p.lastName}</span>
                <span className="block text-xs text-text-muted">{p.position} · {season - p.bornYear} 歲</span>
              </span>
              <span className="num shrink-0 text-right font-mono text-xs text-text-muted">
                {c ? `${fmtMoney(c.salaryPerYear)} × ${c.endSeason - season + 1}` : "—"}
              </span>
            </>
          ), `${p.firstName} ${p.lastName}`);
        })}
        {picks.length > 0 && <li className="px-2 pt-3 pb-1 text-xs uppercase tracking-wider text-text-subtle">選秀權</li>}
        {picks.map((pk) => {
          const a: TradeAsset = { kind: "pick", pickId: pk.id };
          const label = assetLabel(ctx, a);
          return row(a, <span className="flex-1 text-sm">{label}</span>, label);
        })}
      </ul>
    </Card>
  );
}

// S12
function Trade() {
  const { league, teams, userTeam } = useLeague();
  const ctx = useMarket(league.id);
  const others = useMemo(() => teams.filter((t) => !t.isUser).sort((a, b) => a.city.localeCompare(b.city)), [teams]);
  const [partnerId, setPartnerId] = useState(others[0]?.id ?? "");
  const [give, setGive] = useState<TradeAsset[]>([]);
  const [get, setGet] = useState<TradeAsset[]>([]);
  const [done, setDone] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!ctx) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入交易資料" />;

  const offer: TradeOffer = { partnerId, give, get };
  const partner = ctx.teams.get(partnerId);
  const problems = tradeProblems(ctx, offer).filter((p) => p !== "還沒有選任何球員或選秀權");
  const empty = give.length === 0 && get.length === 0;
  const verdict = !empty && problems.length === 0 ? evaluateTrade(ctx, offer) : undefined;
  const closed = tradeWindow(league);
  const toggle = (list: TradeAsset[], set: (x: TradeAsset[]) => void) => (a: TradeAsset) => {
    setDone(undefined); setError(undefined);
    set(list.some((x) => key(x) === key(a)) ? list.filter((x) => key(x) !== key(a)) : [...list, a]);
  };
  const reset = () => { setGive([]); setGet([]); setError(undefined); };
  const side = (team: string, assets: TradeAsset[]) => ({
    team, assets: assets.map((a) => ({ id: key(a), label: assetLabel(ctx, a), salary: a.kind === "player" ? assetSalary(ctx, a) : undefined })),
  });
  const commit = async () => {
    setBusy(true); setError(undefined);
    try {
      await executeTrade(db, league.id, offer);
      setDone(`交易完成：${give.map((a) => assetLabel(ctx, a)).join("、") || "無"} ⇄ ${get.map((a) => assetLabel(ctx, a)).join("、") || "無"}`);
      reset();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const season = capSeason(league);
  const strategy = partner ? strategyOf(ctx, partner.id) : "contending";

  return (
    <div className="space-y-6">
      {closed && <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning" role="status">{closed}。可以先看看，但現在不能成交。</div>}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-[320px]">
          <Field label="交易對象">{(f) => (
            <Select id={f.id} value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setGet([]); setDone(undefined); }}>
              {others.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
            </Select>
          )}</Field>
        </div>
        {partner && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <TeamChip abbrev={partner.abbrev} primary={partner.colors.primary} size={28} />
            <Badge tone={strategy === "rebuilding" ? "info" : "accent"}>{strategy === "rebuilding" ? "重建中：重視年輕球員和選秀權" : "爭冠中：重視即戰力"}</Badge>
            <span className="num font-mono text-xs">薪資 {fmtMoney(payroll(ctx.contracts, partner.id, season))} / {fmtMoney(league.settings.salaryCap)}</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <AssetPicker ctx={ctx} teamId={userTeam.id} selected={give} onToggle={toggle(give, setGive)} title={`你送出（${userTeam.name}）`} />
        {partner && <AssetPicker ctx={ctx} teamId={partner.id} selected={get} onToggle={toggle(get, setGet)} title={`你得到（${partner.name}）`} />}
      </div>

      <Card title="交易內容" action={<Button size="sm" variant="ghost" onClick={reset} disabled={empty}><RotateCcw className="size-4" aria-hidden />清空</Button>}>
        {empty ? <p className="text-sm text-text-muted">從上面兩邊勾選球員或選秀權，對方會即時告訴你他們怎麼想。</p> : (
          <div className="space-y-4">
            <TradePanel a={side(userTeam.name, give)} b={side(partner?.name ?? "", get)} problems={problems}
              verdict={verdict && { decision: verdict.decision === "accept" ? "accept" : verdict.decision === "counter" ? "counter" : "reject", reason: verdict.reason }} />
            {verdict && (
              <div>
                <div className="flex justify-between text-xs text-text-muted"><span>對方的意願</span><span className="num font-mono">{Math.round(Math.min(verdict.ratio, 1.5) * 100)}%</span></div>
                <div className="mt-1 h-[8px] rounded-full bg-surface-raised overflow-hidden" role="meter" aria-label="對方的意願" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(verdict.ratio, 1) * 100)}>
                  <div className={cn("h-full rounded-full", verdict.ratio >= 1 ? "bg-success" : verdict.ratio >= 0.7 ? "bg-warning" : "bg-danger")} style={{ width: `${Math.min(100, Math.max(0, verdict.ratio) * 100)}%` }} />
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {verdict?.decision === "counter" && verdict.counter && (
                <Button variant="secondary" onClick={() => setGive(verdict.counter!.give)}>加上他們要的</Button>
              )}
              <Button loading={busy} disabled={!verdict || verdict.decision !== "accept" || !!closed} onClick={commit}>
                <Check className="size-4" aria-hidden />成交
              </Button>
            </div>
          </div>
        )}
      </Card>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="flex items-center gap-2 text-sm text-success" role="status"><ArrowLeftRight className="size-4" aria-hidden />{done}。<Link className="underline" to={`/l/${league.id}/rotation`}>看看新的輪替</Link></p>}
      <p className="text-xs text-text-subtle">
        規則：交易後超過薪資上限的球隊，收進的薪資最多只能是送出的 125%；名單最多 {league.settings.rosterMax} 人；
        例行賽第 {league.settings.tradeDeadlineDay + 1} 天（交易截止日）之後到季後賽結束前不能交易。難度越高，對方越精明。
      </p>
    </div>
  );
}

export function TradePage() {
  return <LeagueShell title="交易"><Trade /></LeagueShell>;
}
