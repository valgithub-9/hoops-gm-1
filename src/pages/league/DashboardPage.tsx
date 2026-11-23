import { Link } from "react-router-dom";
import { Card, Stat } from "../../components/ui/Card";
import { Scoreboard } from "../../components/ui/Scoreboard";
import { TeamChip } from "../../components/ui/TeamChip";
import { money } from "../../components/ui/ContractTag";
import { useEvents, usePayroll, useTeamGames } from "../../data/queries";
import { InboxItem } from "../../components/ui/Inbox";
import { CONFERENCE_NAMES, conferenceStandings, fmtPct } from "../../lib/standings";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";

// S03
function Dashboard() {
  const { league, userTeam, teams, teamById, standings, phaseDone, problems } = useLeague();
  const events = useEvents(league.id, 6) ?? [];
  const games = useTeamGames(league.id, userTeam.id, league.season) ?? [];
  const payroll = usePayroll(league.id, userTeam.id, league.season) ?? 0;
  const conf = conferenceStandings(teams, standings, userTeam.conference);
  const me = conf.find((r) => r.team.id === userTeam.id)!;
  const played = games.filter((g) => g.status === "final");
  const next = games.find((g) => g.status === "scheduled");
  const recent = played.slice(-3).reverse();
  const streak = (() => {
    let n = 0, kind = "";
    for (const g of [...played].reverse()) {
      const won = (g.homeTeamId === userTeam.id) === (g.scoreHome! > g.scoreAway!);
      const k = won ? "W" : "L";
      if (!kind) kind = k; else if (k !== kind) break;
      n++;
    }
    return n ? `${kind}${n}` : "—";
  })();
  const space = league.settings.salaryCap - payroll;
  const side = (teamId: string, score: number | null) => {
    const t = teamById.get(teamId)!;
    const ts = standings.find((s) => s.teamId === teamId);
    return { abbrev: t.abbrev, name: `${t.city} ${t.name}`, primary: t.colors.primary, score: score ?? 0, record: ts ? `${ts.wins}–${ts.losses}` : undefined };
  };
  const banner =
    problems.length && league.phase !== "draft" ? { title: "還不能開賽", body: `${problems.join("；")}。名單不夠就到自由市場補人，輪替有問題就到輪替頁調整。`, link: problems[0].includes("名單") ? "free-agents" : "rotation" }
    : league.phase === "regular" && phaseDone ? { title: `${league.season} 例行賽結束`, body: `你以 ${me.ts.wins}–${me.ts.losses} 作收，${CONFERENCE_NAMES[userTeam.conference]}第 ${me.rank} 名。${me.rank <= league.settings.playoffTeams / 2 ? "打進季後賽了！" : "沒能打進季後賽。"}按右上角「開始季後賽」。`, link: "standings" }
    : league.phase === "playoffs" ? { title: phaseDone ? `${league.season} 季後賽結束` : `${league.season} 季後賽進行中`, body: phaseDone ? "看看對戰樹和年度獎項，然後前往選秀。" : "每天每組系列賽打一場，先拿 4 勝的晉級。", link: "playoffs" }
    : league.phase === "draft" ? { title: `${league.season} 選秀`, body: phaseDone ? "選秀結束。按「開始新球季」：球員會成長或老化，合約到期的人會續約或離隊。" : "最差戰績先選。到選秀會場挑新秀。", link: "draft" }
    : null;

  return (
    <div className="space-y-6">
      {banner && (
        <Link to={`/l/${league.id}/${banner.link}`} className="block rounded-lg border border-accent/40 bg-accent/10 p-4 hover:bg-accent/15" >
          <div className="font-display uppercase text-accent-text">{banner.title}</div>
          <p className="text-sm text-text-muted mt-1">{banner.body}</p>
        </Link>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="戰績" value={`${me.ts.wins}–${me.ts.losses}`} sub={me.ts.wins + me.ts.losses ? `${CONFERENCE_NAMES[userTeam.conference]}第 ${me.rank} 名` : `${league.season} 球季還沒開打`} />
        <Stat label="連續" value={streak} tone={streak.startsWith("W") ? "success" : streak.startsWith("L") ? "danger" : undefined} />
        <Stat label="薪資空間" value={`${space < 0 ? "-" : ""}${money(Math.abs(space))}`} tone={space < 0 ? "danger" : undefined}
          sub={`總薪資 ${money(payroll)} / 上限 ${money(league.settings.salaryCap)}`} />
        <Stat label="下一場" value={next ? `${next.homeTeamId === userTeam.id ? "vs" : "@"} ${teamById.get(next.homeTeamId === userTeam.id ? next.awayTeamId : next.homeTeamId)!.abbrev}` : "—"}
          sub={next ? `第 ${next.day + 1} 天 · ${next.homeTeamId === userTeam.id ? "主場" : "客場"}` : "本季賽程已打完"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card title="最近比賽" action={<Link to={`/l/${league.id}/schedule`} className="text-xs text-accent-text hover:underline">完整賽程</Link>}>
          {recent.length === 0 ? (
            <p className="text-text-muted">還沒開打。按右上角「推進」打第一場。</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {recent.map((g) => (
                <Link key={g.id} to={`/l/${league.id}/game/${g.id}/box`} className="block rounded-lg focus-visible:outline-2" aria-label="查看 box score">
                  <Scoreboard compact final away={side(g.awayTeamId, g.scoreAway)} home={side(g.homeTeamId, g.scoreHome)} period="" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
        <Card title="收件匣">
          {events.length === 0 ? <p className="text-text-muted text-sm">沒有新消息。</p> : (
            <div className="-mx-3">
              {events.map((e) => (
                <InboxItem key={e.id} e={{ id: e.id, kind: e.type, title: String(e.payload.text ?? ""), when: `${e.season} 第 ${e.day + 1} 天`, unread: e.season === league.season && e.day >= league.day - 1 }} />
              ))}
            </div>
          )}
        </Card>
        <Card title={`${CONFERENCE_NAMES[userTeam.conference]}排名`} action={<Link to={`/l/${league.id}/standings`} className="text-xs text-accent-text hover:underline">全部</Link>}>
          <ol className="-mx-2">
            {conf.slice(0, 8).map((r) => (
              <li key={r.team.id} className={cn("flex items-center gap-2 rounded-md px-2 h-[36px] text-sm", r.team.id === userTeam.id && "bg-accent/10 text-accent-text font-semibold")}>
                <span className="num w-[20px] text-right font-mono text-xs text-text-subtle">{r.rank}</span>
                <TeamChip abbrev={r.team.abbrev} primary={r.team.colors.primary} size={24} />
                <span className="flex-1 truncate">{r.team.city} {r.team.name}</span>
                <span className="num font-mono text-xs">{r.ts.wins}–{r.ts.losses}</span>
                <span className="num w-[40px] text-right font-mono text-xs text-text-muted">{fmtPct(r.pct)}</span>
              </li>
            ))}
          </ol>
        </Card>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  return <LeagueShell title="球隊總覽"><Dashboard /></LeagueShell>;
}
