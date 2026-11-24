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
import { tr } from "../../i18n";

const tactics = () => [
  { key: "pace", label: tr("節奏", "Pace"), low: tr("慢", "Slow"), high: tr("快", "Fast") },
  { key: "threePointFocus", label: tr("三分傾向", "Three-point focus"), low: tr("打內線", "Inside"), high: tr("多投三分", "More threes") },
  { key: "defensePressure", label: tr("防守強度", "Defensive pressure"), low: tr("保守", "Soft"), high: tr("高壓（易犯規）", "High (more fouls)") },
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
  if (!rows) return <div className="h-[400px] rounded-lg bg-surface animate-pulse" aria-busy aria-label={tr("載入名單中", "Loading roster")} />;

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
    try { await saveRotation(db, league.id, draft); setSaved(tr("已儲存。下一場比賽開始生效。", "Saved. It applies from the next game.")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-6">
      <div className={cn("sticky top-header z-20 -mx-4 px-4 py-3 bg-bg/95 backdrop-blur border-b border-border flex flex-wrap items-center gap-3")}>
        <div className="num font-mono text-sm" role="status" aria-live="polite">
          {tr("上場時間", "Minutes")} <span className={total === 240 ? "text-success" : "text-warning"}>{total}</span> / 240
          · {tr("先發", "Starters")} <span className={draft.starters.length === 5 ? "text-success" : "text-warning"}>{draft.starters.filter((s) => ids.includes(s)).length}</span> / 5
        </div>
        {saved && !dirty && <span className="text-sm text-success" role="status">{saved}</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={async () => setDraft(await suggestedRotation(db, league.id))}><Wand2 className="size-4" aria-hidden />{tr("依總評自動排", "Auto by overall")}</Button>
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft(userTeam.rotation)}>{tr("還原", "Revert")}</Button>
          <Button size="sm" disabled={!dirty || problems.length > 0} onClick={save}>{tr("儲存輪替", "Save rotation")}</Button>
        </div>
      </div>
      {problems.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={tr("輪替問題", "Rotation problems")}>{problems.map((p) => <li key={p}><Badge tone="warning">{p}</Badge></li>)}</ul>}
      {(() => {
        const hurt = rows.filter((r) => r.player.injury && draft.starters.includes(r.player.id));
        return hurt.length > 0 && (
          <p className="text-sm text-warning" role="status">
            {tr(`先發 ${hurt.map((r) => r.player.lastName).join("、")} 受傷中：比賽時會由替補自動頂上，他的上場時間分給其他人。也可以現在就換掉他。`, `Starter ${hurt.map((r) => r.player.lastName).join(", ")} is injured: a bench player starts in his place and his minutes go to others. You can also swap him out now.`)}
          </p>
        );
      })()}
      <p className="text-xs text-text-subtle">{tr("分鐘數是目標：球員累了會被換下、犯規麻煩會先坐板凳、比分接近的最後 4 分鐘會留最好的球員在場上，所以實際分鐘會有幾分鐘的差距。", "Minutes are targets: tired players come out, players in foul trouble sit, and the best five close out tight games, so real minutes vary by a few.")}</p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{tr("輪替：先發與上場時間", "Rotation: starters and minutes")}</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <th scope="col" className="h-[36px] px-3 text-left">{tr("先發", "Start")}</th>
              <th scope="col" className="px-3 text-left">{tr("球員", "Player")}</th>
              <th scope="col" className="px-3 text-left">{tr("位置", "Pos")}</th>
              <th scope="col" className="px-3 text-right">{tr("總評", "Ovr")}</th>
              <th scope="col" className="px-3 text-left">{tr("上場時間（分鐘）", "Minutes")}</th>
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
                    <input type="checkbox" className="size-4 accent-[rgb(var(--color-accent))]" checked={starter} onChange={() => toggleStarter(id)} aria-label={tr(`${name} 先發`, `${name} starts`)} />
                  </td>
                  <td className="px-3">
                    <Link to={`/l/${league.id}/player/${id}`} className="font-medium hover:text-accent-text">{name}</Link>
                    {r.player.injury && <Badge tone="danger" className="ml-2">{tr(`傷 · 缺 ${r.player.injury.gamesRemaining} 場`, `injured · out ${r.player.injury.gamesRemaining}`)}</Badge>}
                  </td>
                  <td className="px-3 text-text-muted">{r.player.position}</td>
                  <td className="px-3 text-right"><Ovr value={r.player.overall} size="sm" /></td>
                  <td className="px-3">
                    <div className="flex items-center gap-3 sm:min-w-[220px]">
                      <input type="range" min={0} max={48} value={min} onChange={(e) => setMin(id, +e.target.value)} className="hidden sm:block flex-1 accent-[rgb(var(--color-accent))]" aria-label={tr(`${name} 上場時間`, `${name} minutes`)} />
                      <input type="number" min={0} max={48} value={min} onChange={(e) => setMin(id, +e.target.value)}
                        className="num w-[56px] h-[32px] rounded-sm bg-bg border border-border-input px-2 text-right font-mono" aria-label={tr(`${name} 上場分鐘數`, `${name} minutes, number`)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card title={tr("戰術", "Tactics")}>
        <div className="grid sm:grid-cols-3 gap-4">
          {tactics().map((t) => (
            <Field key={t.key} label={t.label} hint={`${t.low} ← → ${t.high}`}>{(f) => (
              <Select id={f.id} aria-describedby={f.describedBy} value={draft.tactics[t.key]}
                onChange={(e) => setDraft((d) => ({ ...d, tactics: { ...d.tactics, [t.key]: +e.target.value } }))}>
                {LEVELS.map((l) => <option key={l} value={l}>{l === 0 ? tr("標準", "Standard") : l > 0 ? `${t.high} ${"+".repeat(l)}` : `${t.low} ${"−".repeat(-l)}`}</option>)}
              </Select>
            )}</Field>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function RotationPage() {
  return <LeagueShell title={tr("輪替與戰術", "Rotation & Tactics")}><RotationEditor /></LeagueShell>;
}
