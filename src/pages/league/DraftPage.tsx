import { useState } from "react";
import { Link } from "react-router-dom";
import { FastForward, SkipForward } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Ovr } from "../../components/ui/RatingBar";
import { TeamChip } from "../../components/ui/TeamChip";
import { scoutedPotential } from "../../data/draft";
import { useDraft } from "../../data/queries";
import type { Player } from "../../db";
import { cn } from "../../lib/cn";
import { sim } from "../../worker/client";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr } from "../../i18n";

// S14
function Draft() {
  const { league, teamById, userTeam } = useLeague();
  const state = useDraft(league);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!state) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入選秀", "Loading draft")} />;
  const { picks, prospects, next, drafted } = state;
  const live = league.phase === "draft";
  const onClock = live && next?.ownerTeamId === userTeam.id;
  const age = (p: Player) => league.season + 1 - p.bornYear;
  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(undefined);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const cols: Column<Player>[] = [
    { key: "name", header: tr("新秀", "Prospect"), sticky: true, sortValue: (p) => p.lastName,
      cell: (p) => <Link to={`/l/${league.id}/player/${p.id}`} className="font-medium hover:text-accent-text">{p.firstName} {p.lastName}</Link> },
    { key: "pos", header: tr("位置", "Pos"), cell: (p) => p.position },
    { key: "age", header: tr("年齡", "Age"), numeric: true, cell: age, sortValue: age },
    { key: "ht", header: tr("身高", "Height"), numeric: true, cell: (p) => p.heightCm, sortValue: (p) => p.heightCm },
    { key: "ovr", header: tr("總評", "Ovr"), numeric: true, cell: (p) => <Ovr value={p.overall} size="sm" />, sortValue: (p) => p.overall },
    { key: "pot", header: tr("潛力（估）", "Potential (est.)"), numeric: true, cell: (p) => { const [a, b] = scoutedPotential(p); return `${a}–${b}`; }, sortValue: (p) => scoutedPotential(p)[1] },
    ...(onClock ? [{ key: "pick", header: "", cell: (p: Player) => (
      <Button size="sm" disabled={busy} onClick={() => go(() => sim.draftPlayer(league.id, p.id))} aria-label={tr(`選 ${p.firstName} ${p.lastName}`, `Draft ${p.firstName} ${p.lastName}`)}>{tr("選他", "Draft")}</Button>
    ) }] : []),
  ];

  return (
    <div className="space-y-6">
      {!live && <Card><p className="text-text-muted">{tr(`${league.season} 選秀會在季後賽結束後進行，最差戰績先選。下面是今年的新秀名單，總評是現在的能力，潛力是球探的估計區間。`, `The ${league.season} draft happens after the playoffs; worst record picks first. These are this year's prospects: overall is their level today, potential is the scouts' estimated range.`)}</p></Card>}
      {live && (
        <div className={cn("rounded-lg border p-4 flex flex-wrap items-center gap-3", onClock ? "border-accent bg-accent/10 shadow-glow" : "border-border bg-surface")} role="status" aria-live="polite">
          {next ? (
            <>
              <TeamChip abbrev={teamById.get(next.ownerTeamId)!.abbrev} primary={teamById.get(next.ownerTeamId)!.colors.primary} />
              <div className="flex-1 min-w-0">
                <div className="font-display uppercase">{onClock ? tr("輪到你了！", "You're on the clock!") : tr(`${teamById.get(next.ownerTeamId)!.city} ${teamById.get(next.ownerTeamId)!.name} 選秀中`, `The ${teamById.get(next.ownerTeamId)!.city} ${teamById.get(next.ownerTeamId)!.name} are picking`)}</div>
                <div className="text-xs text-text-muted">{tr(`第 ${next.round} 輪，第 ${next.pickNo} 順位`, `Round ${next.round}, pick ${next.pickNo}`)}</div>
              </div>
              {!onClock && <Button loading={busy} onClick={() => go(() => sim.autoDraft(league.id, "untilUser"))}><FastForward className="size-4" aria-hidden />{tr("模擬到輪到我", "Sim to my pick")}</Button>}
              <Button variant="secondary" disabled={busy} onClick={() => go(() => sim.autoDraft(league.id, "all"))}><SkipForward className="size-4" aria-hidden />{tr("全部自動選完", "Auto-draft the rest")}</Button>
            </>
          ) : <div className="font-display uppercase">{tr("選秀結束。按右上角「開始新球季」。", "The draft is over. Press Start new season at the top right.")}</div>}
        </div>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
        <section className="space-y-2 min-w-0">
          <h2 className="font-display text-lg uppercase">{tr(`新秀（${prospects.length}）`, `Prospects (${prospects.length})`)}</h2>
          <DataTable caption={tr("可選新秀", "Available prospects")} rows={prospects} columns={cols} rowKey={(p) => p.id} initialSort={{ key: "ovr", dir: "desc" }} empty={tr("新秀都被選完了。", "Every prospect has been drafted.")} />
        </section>
        {live && (
          <Card title={tr("選秀順位", "Draft order")}>
            <ol className="-mx-2 max-h-[560px] overflow-y-auto">
              {picks.map((pk) => {
                const t = teamById.get(pk.ownerTeamId)!;
                const mine = pk.ownerTeamId === userTeam.id;
                return (
                  <li key={pk.id} className={cn("flex items-center gap-2 px-2 h-[36px] text-sm rounded-md", pk.id === next?.id && "bg-accent/15", mine && "text-accent-text")}>
                    <span className="num w-[28px] text-right font-mono text-xs text-text-subtle">{pk.pickNo}</span>
                    <TeamChip abbrev={t.abbrev} primary={t.colors.primary} size={22} />
                    <span className="flex-1 truncate">{pk.playerId ? <PickedName player={drafted.get(pk.playerId)} leagueId={league.id} /> : <span className="text-text-subtle">—</span>}</span>
                    {mine && <Badge tone="accent">{tr("你", "You")}</Badge>}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}

function PickedName({ player, leagueId }: { player?: Player; leagueId: string }) {
  if (!player) return <span>—</span>;
  return <Link to={`/l/${leagueId}/player/${player.id}`} className="hover:underline">{player.firstName[0]}. {player.lastName} <span className="text-text-subtle">{player.position}</span></Link>;
}

export function DraftPage() {
  return <LeagueShell title={tr("選秀", "Draft")}><Draft /></LeagueShell>;
}
