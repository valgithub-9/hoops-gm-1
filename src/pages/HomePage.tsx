import { LangToggle } from "../components/ui/LangToggle";
import { Link, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { Download, Plus, Trash2, Play, Upload } from "lucide-react";
import { exportLeague, importLeague } from "../data/saveFile";
import { Button } from "../components/ui/Button";
import { Modal, ModalClose } from "../components/ui/Modal";
import { TeamChip } from "../components/ui/TeamChip";
import { useLeagues } from "../data/queries";
import { deleteLeague } from "../data/league";
import { db } from "../db";
import { tr, lang } from "../i18n";

const when = (iso: string) => new Date(iso).toLocaleString(lang() === "en" ? "en-US" : "zh-TW", { dateStyle: "medium", timeStyle: "short" });

// S01
export function HomePage() {
  const saves = useLeagues();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string }>();
  const download = async (id: string, name: string) => {
    const file = await exportLeague(db, id);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}-${file.league.season}.hoopsgm.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const id = await importLeague(db, await f.text());
      setMsg({ tone: "ok", text: tr("匯入成功。", "Save imported.") });
      navigate(`/l/${id}/team`);
    } catch (e) {
      setMsg({ tone: "err", text: tr("匯入失敗：", "Import failed: ") + (e instanceof Error ? e.message : String(e)) });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-[720px] space-y-8">
        <div className="flex justify-end"><LangToggle /></div>
        <header className="space-y-3 text-center">
          <span className="inline-block size-[40px] rounded-full bg-accent shadow-glow" aria-hidden />
          <h1 className="font-display text-display uppercase tracking-wide">Hoops GM</h1>
          <p className="text-text-muted">{tr("接手一支虛構球隊，選秀、交易、排輪替，一季一季打出王朝。", "Take over a fictional team. Draft, trade, set the rotation, and build a dynasty one season at a time.")}</p>
          <Button size="lg" onClick={() => navigate("/new")}><Plus className="size-4" aria-hidden />{tr("開新聯盟", "New league")}</Button>
        </header>

        <section aria-labelledby="saves-h" className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 id="saves-h" className="font-display text-lg uppercase tracking-wide">{tr("存檔", "Saves")}</h2>
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}><Upload className="size-4" aria-hidden />{tr("匯入存檔", "Import save")}</Button>
            <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label={tr("選擇存檔檔案", "Choose a save file")} onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {msg && <p className={msg.tone === "ok" ? "text-sm text-success" : "text-sm text-danger"} role={msg.tone === "err" ? "alert" : "status"}>{msg.text}</p>}
          {saves === undefined ? (
            <div className="space-y-2" aria-busy>{[0, 1].map((i) => <div key={i} className="h-[72px] rounded-lg bg-surface animate-pulse" />)}</div>
          ) : saves.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-text-muted">{tr("還沒有存檔。開一個新聯盟開始吧。", "No saves yet. Start a new league.")}</p>
          ) : (
            <ul className="space-y-2">
              {saves.map(({ league, team }) => (
                <li key={league.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                  {team && <TeamChip abbrev={team.abbrev} primary={team.colors.primary} size={40} />}
                  <Link to={`/l/${league.id}/team`} className="min-w-0 flex-1 group">
                    <div className="truncate font-semibold group-hover:text-accent-text">{league.name}</div>
                    <div className="truncate text-xs text-text-muted">
                      {team ? `${team.city} ${team.name}` : "—"} · {tr(`${league.season} 球季第 ${league.day} 天`, `${league.season} season, day ${league.day}`)} · {when(league.updatedAt)}
                    </div>
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/l/${league.id}/team`)} aria-label={tr(`繼續 ${league.name}`, `Continue ${league.name}`)}>
                    <Play className="size-3" aria-hidden />{tr("繼續", "Continue")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => download(league.id, league.name)} aria-label={tr(`匯出 ${league.name}`, `Export ${league.name}`)} title={tr("匯出存檔", "Export save")}>
                    <Download className="size-4" aria-hidden />
                  </Button>
                  <Modal
                    trigger={<Button size="sm" variant="ghost" aria-label={tr(`刪除 ${league.name}`, `Delete ${league.name}`)}><Trash2 className="size-4" aria-hidden /></Button>}
                    title={tr("刪除這份存檔？", "Delete this save?")}
                    description={tr(`「${league.name}」的所有比賽、球員和紀錄會永久刪除，無法復原。`, `All games, players and records in "${league.name}" will be deleted for good. This cannot be undone.`)}
                    footer={<>
                      <ModalClose asChild><Button variant="secondary">{tr("取消", "Cancel")}</Button></ModalClose>
                      <ModalClose asChild><Button variant="danger" onClick={() => deleteLeague(db, league.id)}>{tr("永久刪除", "Delete for good")}</Button></ModalClose>
                    </>}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-center text-xs text-text-subtle">{tr("存檔只存在這個瀏覽器裡，換電腦前請先匯出。所有球隊與球員皆為虛構。", "Saves live only in this browser; export before switching devices. All teams and players are fictional.")} · <Link to="/design" className="underline">{tr("設計系統", "Design system")}</Link></p>
      </div>
    </div>
  );
}
