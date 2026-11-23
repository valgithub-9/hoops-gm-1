import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Play } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Modal, ModalClose } from "../components/ui/Modal";
import { TeamChip } from "../components/ui/TeamChip";
import { useLeagues } from "../data/queries";
import { deleteLeague } from "../data/league";
import { db } from "../db";

const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });

// S01
export function HomePage() {
  const saves = useLeagues();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-[720px] space-y-8">
        <header className="space-y-3 text-center pt-6">
          <span className="inline-block size-[40px] rounded-full bg-accent shadow-glow" aria-hidden />
          <h1 className="font-display text-display uppercase tracking-wide">Hoops GM</h1>
          <p className="text-text-muted">接手一支虛構球隊，選秀、交易、排輪替，一季一季打出王朝。</p>
          <Button size="lg" onClick={() => navigate("/new")}><Plus className="size-4" aria-hidden />開新聯盟</Button>
        </header>

        <section aria-labelledby="saves-h" className="space-y-3">
          <h2 id="saves-h" className="font-display text-lg uppercase tracking-wide border-b border-border pb-2">存檔</h2>
          {saves === undefined ? (
            <div className="space-y-2" aria-busy>{[0, 1].map((i) => <div key={i} className="h-[72px] rounded-lg bg-surface animate-pulse" />)}</div>
          ) : saves.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-text-muted">還沒有存檔。開一個新聯盟開始吧。</p>
          ) : (
            <ul className="space-y-2">
              {saves.map(({ league, team }) => (
                <li key={league.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                  {team && <TeamChip abbrev={team.abbrev} primary={team.colors.primary} size={40} />}
                  <Link to={`/l/${league.id}/team`} className="min-w-0 flex-1 group">
                    <div className="truncate font-semibold group-hover:text-accent-text">{league.name}</div>
                    <div className="truncate text-xs text-text-muted">
                      {team ? `${team.city} ${team.name}` : "—"} · {league.season} 球季第 {league.day} 天 · {when(league.updatedAt)}
                    </div>
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/l/${league.id}/team`)} aria-label={`繼續 ${league.name}`}>
                    <Play className="size-3" aria-hidden />繼續
                  </Button>
                  <Modal
                    trigger={<Button size="sm" variant="ghost" aria-label={`刪除 ${league.name}`}><Trash2 className="size-4" aria-hidden /></Button>}
                    title="刪除這份存檔？"
                    description={`「${league.name}」的所有比賽、球員和紀錄會永久刪除，無法復原。`}
                    footer={<>
                      <ModalClose asChild><Button variant="secondary">取消</Button></ModalClose>
                      <ModalClose asChild><Button variant="danger" onClick={() => deleteLeague(db, league.id)}>永久刪除</Button></ModalClose>
                    </>}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-center text-xs text-text-subtle">存檔只存在這個瀏覽器裡。所有球隊與球員皆為虛構。 · <Link to="/design" className="underline">設計系統</Link></p>
      </div>
    </div>
  );
}
