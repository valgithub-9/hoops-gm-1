import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Dices } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Field";
import { TeamChip } from "../components/ui/TeamChip";
import { previewTeams } from "../data/league";
import { sim } from "../worker/client";
import { cn } from "../lib/cn";
import { tr } from "../i18n";

const randomSeed = () => Math.random().toString(36).slice(2, 10);
const TEAM_COUNTS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const gameCounts = () => [{ v: 82, label: tr("82 場（完整賽季）", "82 games (full season)") }, { v: 41, label: tr("41 場（半季）", "41 games (half season)") }, { v: 20, label: tr("20 場（快速）", "20 games (quick)") }];

// S02
export function NewLeaguePage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => tr("我的聯盟", "My League"));
  const [numTeams, setNumTeams] = useState(30);
  const [games, setGames] = useState(82);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [seed, setSeed] = useState(randomSeed);
  const [teamIndex, setTeamIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const teams = useMemo(() => previewTeams(seed, numTeams), [seed, numTeams]);
  const nameError = name.trim().length === 0 ? tr("請輸入聯盟名稱", "Enter a league name") : name.length > 40 ? tr("最多 40 字", "40 characters at most") : undefined;

  const create = async () => {
    if (nameError) return;
    setCreating(true);
    setError(undefined);
    try {
      const id = await sim.createLeague({ name, numTeams, gamesPerSeason: games, userTeamIndex: Math.min(teamIndex, numTeams - 1), difficulty, seed });
      navigate(`/l/${id}/team`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto max-w-[880px] space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />{tr("返回", "Back")}</Link>
        <h1 className="font-display text-xl uppercase tracking-wide">{tr("開新聯盟", "New league")}</h1>

        <Card title={tr("聯盟設定", "League settings")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={tr("聯盟名稱", "League name")} error={nameError}>{(f) =>
              <Input id={f.id} aria-invalid={f.invalid} aria-describedby={f.describedBy} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label={tr("難度", "Difficulty")} hint={tr("會影響 AI 交易的精明程度", "How hard the AI bargains in trades")}>{(f) =>
              <Select id={f.id} aria-describedby={f.describedBy} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                <option value="easy">{tr("輕鬆", "Easy")}</option><option value="normal">{tr("一般", "Normal")}</option><option value="hard">{tr("困難", "Hard")}</option>
              </Select>}
            </Field>
            <Field label={tr("球隊數", "Teams")}>{(f) =>
              <Select id={f.id} value={numTeams} onChange={(e) => setNumTeams(+e.target.value)}>
                {TEAM_COUNTS.map((n) => <option key={n} value={n}>{tr(`${n} 隊`, `${n} teams`)}</option>)}
              </Select>}
            </Field>
            <Field label={tr("每季場數", "Games per season")}>{(f) =>
              <Select id={f.id} value={games} onChange={(e) => setGames(+e.target.value)}>
                {gameCounts().map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
              </Select>}
            </Field>
          </div>
        </Card>

        <Card title={tr("選擇你的球隊", "Choose your team")} action={
          <Button size="sm" variant="secondary" onClick={() => { setSeed(randomSeed()); setTeamIndex(0); }}>
            <Dices className="size-4" aria-hidden />{tr("重新產生聯盟", "New random league")}
          </Button>
        }>
          <p className="mb-3 text-xs text-text-subtle">{tr("聯盟種子：", "League seed: ")}<span className="font-mono">{seed}</span>{tr("。同一個種子會產生同樣的聯盟。", ". The same seed always makes the same league.")}</p>
          <div role="radiogroup" aria-label={tr("選擇球隊", "Choose a team")} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {teams.map((t, i) => {
              const selected = i === teamIndex;
              return (
                <button key={t.abbrev} type="button" role="radio" aria-checked={selected} onClick={() => setTeamIndex(i)}
                  className={cn("flex items-center gap-3 rounded-md border p-2 text-left transition-colors duration-fast",
                    selected ? "border-accent bg-accent/10 shadow-glow" : "border-border bg-surface-raised hover:border-border-input")}>
                  <TeamChip abbrev={t.abbrev} primary={t.colors.primary} />
                  <span className="min-w-0">
                    <span className="block truncate font-display uppercase">{t.city} {t.name}</span>
                    <span className="block text-xs text-text-muted">{i < numTeams / 2 ? tr("東區", "East") : tr("西區", "West")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {error && <p className="rounded-md border border-danger/40 p-3 text-sm text-danger" role="alert">{tr("建立失敗：", "Could not create the league: ")}{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate("/")}>{tr("取消", "Cancel")}</Button>
          <Button size="lg" loading={creating} disabled={!!nameError} onClick={create}>
            {creating ? tr("產生聯盟中…", "Creating league…") : tr(`接手 ${teams[Math.min(teamIndex, numTeams - 1)]?.name ?? ""}`, `Take over the ${teams[Math.min(teamIndex, numTeams - 1)]?.name ?? ""}`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
