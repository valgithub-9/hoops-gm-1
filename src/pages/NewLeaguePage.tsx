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

const randomSeed = () => Math.random().toString(36).slice(2, 10);
const TEAM_COUNTS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const GAME_COUNTS = [{ v: 82, label: "82 場（完整賽季）" }, { v: 41, label: "41 場（半季）" }, { v: 20, label: "20 場（快速）" }];

// S02
export function NewLeaguePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("我的聯盟");
  const [numTeams, setNumTeams] = useState(30);
  const [games, setGames] = useState(82);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [seed, setSeed] = useState(randomSeed);
  const [teamIndex, setTeamIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const teams = useMemo(() => previewTeams(seed, numTeams), [seed, numTeams]);
  const nameError = name.trim().length === 0 ? "請輸入聯盟名稱" : name.length > 40 ? "最多 40 字" : undefined;

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
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />返回</Link>
        <h1 className="font-display text-xl uppercase tracking-wide">開新聯盟</h1>

        <Card title="聯盟設定">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="聯盟名稱" error={nameError}>{(f) =>
              <Input id={f.id} aria-invalid={f.invalid} aria-describedby={f.describedBy} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="難度" hint="會影響之後 AI 交易的精明程度">{(f) =>
              <Select id={f.id} aria-describedby={f.describedBy} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                <option value="easy">輕鬆</option><option value="normal">一般</option><option value="hard">困難</option>
              </Select>}
            </Field>
            <Field label="球隊數">{(f) =>
              <Select id={f.id} value={numTeams} onChange={(e) => setNumTeams(+e.target.value)}>
                {TEAM_COUNTS.map((n) => <option key={n} value={n}>{n} 隊</option>)}
              </Select>}
            </Field>
            <Field label="每季場數">{(f) =>
              <Select id={f.id} value={games} onChange={(e) => setGames(+e.target.value)}>
                {GAME_COUNTS.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
              </Select>}
            </Field>
          </div>
        </Card>

        <Card title="選擇你的球隊" action={
          <Button size="sm" variant="secondary" onClick={() => { setSeed(randomSeed()); setTeamIndex(0); }}>
            <Dices className="size-4" aria-hidden />重新產生聯盟
          </Button>
        }>
          <p className="mb-3 text-xs text-text-subtle">聯盟種子：<span className="font-mono">{seed}</span>。同一個種子會產生同樣的聯盟。</p>
          <div role="radiogroup" aria-label="選擇球隊" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {teams.map((t, i) => {
              const selected = i === teamIndex;
              return (
                <button key={t.abbrev} type="button" role="radio" aria-checked={selected} onClick={() => setTeamIndex(i)}
                  className={cn("flex items-center gap-3 rounded-md border p-2 text-left transition-colors duration-fast",
                    selected ? "border-accent bg-accent/10 shadow-glow" : "border-border bg-surface-raised hover:border-border-input")}>
                  <TeamChip abbrev={t.abbrev} primary={t.colors.primary} />
                  <span className="min-w-0">
                    <span className="block truncate font-display uppercase">{t.city} {t.name}</span>
                    <span className="block text-xs text-text-muted">{i < numTeams / 2 ? "東區" : "西區"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {error && <p className="rounded-md border border-danger/40 p-3 text-sm text-danger" role="alert">建立失敗：{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate("/")}>取消</Button>
          <Button size="lg" loading={creating} disabled={!!nameError} onClick={create}>
            {creating ? "產生聯盟中…" : `接手 ${teams[Math.min(teamIndex, numTeams - 1)]?.name ?? ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
