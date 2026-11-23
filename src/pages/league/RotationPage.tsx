import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wand2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, Select } from "../../components/ui/Field";
import { Ovr } from "../../components/ui/RatingBar";
import { rotationProblems } from "../../data/advance";
import { useRoster } from "../../data/queries";
import { saveRotation, suggestedRotation } from "../../data/team";
import { db, type Rotation } from "../../db";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

const TACTICS = [
  { key: "pace", label: "節奏", low: "慢", high: "快" },
  { key: "threePointFocus", label: "三分傾向", low: "打內線", high: "多投三分" },
  { key: "defensePressure", label: "防守強度", low: "保守", high: "高壓（易犯規）" },
] as const;
const LEVELS = [-2, -1, 0, 1, 2];

// S06
function RotationEditor() {
  const { league, userTeam } = useLeague();
  const rows = useRoster(league.id, userTeam, league.season);
  const [draft, setDraft] = useState<Rotation>(userTeam.rotation);
  const [saved, setSaved] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => setDraft(userTeam.rotation), [userTeam.rotation]);

  const ids = useMemo(() => (rows ?? []).map((r) => r.player.id), [rows]);
  const problems = rotationProblems(draft, ids, league.settings.rosterMin);
  const total = ids.reduce((n, id) => n + (draft.minutes[id] ?? 0), 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(userTeam.rotation);
  if (!rows) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label="載入名單中" />;

  // Order by the saved rotation, not the draft: rows must not jump while you type.
  const saved0 = userTeam.rotation;
  const sorted = [...rows].sort((a, b) =>
    Number(saved0.starters.includes(b.player.id)) - Number(saved0.starters.includes(a.player.id))
    || (saved0.minutes[b.player.id] ?? 0) - (saved0.minutes[a.player.id] ?? 0)
    || b.player.overall - a.player.overall);
  const setMin = (id: string, v: number) => setDraft((d) => ({ ...d, minutes: { ...d.minutes, [id]: Math.max(0, Math.min(48, Math.round(v || 0))) } }));
  const toggleStarter = (id: string) => setDraft((d) => ({
    ...d, starters: d.starters.includes(id) ? d.starters.filter((x) => x !== id) : [...d.starters, id],
  }));
  const save = async () => {
    setError(undefined); setSaved(undefined);
    try { await saveRotation(db, league.id, draft); setSaved("已儲存。下一場比賽開始生效。"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-6">
      <div className={cn("sticky top-header z-20 -mx-4 px-4 py-3 bg-bg/95 backdrop-blur border-b border-border flex flex-wrap items-center gap-3")}>
        <div className="num font-mono text-sm" role="status" aria-live="polite">
          上場時間 <span className={total === 240 ? "text-success" : "text-warning"}>{total}</span> / 240
          · 先發 <span className={draft.starters.length === 5 ? "text-success" : "text-warning"}>{draft.starters.filter((s) => ids.includes(s)).length}</span> / 5
        </div>
        {saved && !dirty && <span className="text-sm text-success" role="status">{saved}</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={async () => setDraft(await suggestedRotation(db, league.id))}><Wand2 className="size-4" aria-hidden />依總評自動排</Button>
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft(userTeam.rotation)}>還原</Button>
          <Button size="sm" disabled={!dirty || problems.length > 0} onClick={save}>儲存輪替</Button>
        </div>
      </div>
      {problems.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="輪替問題">{problems.map((p) => <li key={p}><Badge tone="warning">{p}</Badge></li>)}</ul>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">輪替：先發與上場時間</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <th scope="col" className="h-[36px] px-3 text-left">先發</th>
              <th scope="col" className="px-3 text-left">球員</th>
              <th scope="col" className="px-3 text-left">位置</th>
              <th scope="col" className="px-3 text-right">總評</th>
              <th scope="col" className="px-3 text-left">上場時間（分鐘）</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const id = r.player.id;
              const starter = draft.starters.includes(id);
              const min = draft.minutes[id] ?? 0;
              const name = `${r.player.firstName} ${r.player.lastName}`;
              return (
                <tr key={id} className={cn("border-b border-border last:border-0", starter && "bg-accent/5")}>
                  <td className="px-3 h-[52px]">
                    <input type="checkbox" className="size-4 accent-[rgb(var(--color-accent))]" checked={starter} onChange={() => toggleStarter(id)} aria-label={`${name} 先發`} />
                  </td>
                  <td className="px-3"><Link to={`/l/${league.id}/player/${id}`} className="font-medium hover:text-accent-text">{name}</Link></td>
                  <td className="px-3 text-text-muted">{r.player.position}</td>
                  <td className="px-3 text-right"><Ovr value={r.player.overall} size="sm" /></td>
                  <td className="px-3">
                    <div className="flex items-center gap-3 sm:min-w-[220px]">
                      <input type="range" min={0} max={48} value={min} onChange={(e) => setMin(id, +e.target.value)} className="hidden sm:block flex-1 accent-[rgb(var(--color-accent))]" aria-label={`${name} 上場時間`} />
                      <input type="number" min={0} max={48} value={min} onChange={(e) => setMin(id, +e.target.value)}
                        className="num w-[56px] h-[32px] rounded-sm bg-bg border border-border-input px-2 text-right font-mono" aria-label={`${name} 上場分鐘數`} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card title="戰術">
        <div className="grid sm:grid-cols-3 gap-4">
          {TACTICS.map((t) => (
            <Field key={t.key} label={t.label} hint={`${t.low} ← → ${t.high}`}>{(f) => (
              <Select id={f.id} aria-describedby={f.describedBy} value={draft.tactics[t.key]}
                onChange={(e) => setDraft((d) => ({ ...d, tactics: { ...d.tactics, [t.key]: +e.target.value } }))}>
                {LEVELS.map((l) => <option key={l} value={l}>{l === 0 ? "標準" : l > 0 ? `${t.high} ${"+".repeat(l)}` : `${t.low} ${"−".repeat(-l)}`}</option>)}
              </Select>
            )}</Field>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function RotationPage() {
  return <LeagueShell title="輪替與戰術"><RotationEditor /></LeagueShell>;
}
