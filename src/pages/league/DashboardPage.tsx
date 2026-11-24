import { Link } from "react-router-dom";
import { Card, Stat } from "../../components/ui/Card";
import { Scoreboard } from "../../components/ui/Scoreboard";
import { TeamChip } from "../../components/ui/TeamChip";
import { money } from "../../components/ui/ContractTag";
import { useEvents, usePayroll, useTeamGames } from "../../data/queries";
import { InboxItem } from "../../components/ui/Inbox";
import { conferenceName, conferenceStandings, fmtPct } from "../../lib/standings";
import { cn } from "../../lib/cn";
import { LeagueShell, useLeague } from "./LeagueShell";
import { tr, ordinal } from "../../i18n";

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
    problems.length && league.phase !== "draft" ? { title: tr("還不能開賽", "Not ready to play"), body: tr(`${problems.join("；")}。名單不夠就到自由市場補人，輪替有問題就到輪替頁調整。`, `${problems.join("; ")}. Sign players in Free Agency if the roster is short, or fix the Rotation.`), link: /名單|roster/i.test(problems[0]) ? "free-agents" : "rotation" }
    : league.phase === "regular" && phaseDone ? { title: tr(`${league.season} 例行賽結束`, `${league.season} regular season over`), body: tr(`你以 ${me.ts.wins}–${me.ts.losses} 作收，${conferenceName(userTeam.conference)}第 ${me.rank} 名。${me.rank <= league.settings.playoffTeams / 2 ? "打進季後賽了！" : "沒能打進季後賽。"}按右上角「開始季後賽」。`, `You finished ${me.ts.wins}–${me.ts.losses}, ${ordinal(me.rank)} in the ${conferenceName(userTeam.conference)}. ${me.rank <= league.settings.playoffTeams / 2 ? "You made the playoffs!" : "You missed the playoffs."} Press Start playoffs at the top right.`), link: "standings" }
    : league.phase === "playoffs" ? { title: phaseDone ? tr(`${league.season} 季後賽結束`, `${league.season} playoffs over`) : tr(`${league.season} 季後賽進行中`, `${league.season} playoffs under way`), body: phaseDone ? tr("看看對戰樹和年度獎項，然後前往選秀。", "Check the bracket and the awards, then go to the draft.") : tr("每天每組系列賽打一場，先拿 4 勝的晉級。", "Each series plays one game a day; first to 4 wins advances."), link: "playoffs" }
    : league.phase === "draft" ? { title: tr(`${league.season} 選秀`, `${league.season} draft`), body: phaseDone ? tr("選秀結束。按「開始新球季」：球員會成長或老化，合約到期的人會續約或離隊。", "The draft is done. Press Start new season: players grow or age, and expiring contracts are re-signed or leave.") : tr("最差戰績先選。到選秀會場挑新秀。", "Worst record picks first. Go to the draft room to pick."), link: "draft" }
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
        <Stat label={tr("戰績", "Record")} value={`${me.ts.wins}–${me.ts.losses}`} sub={me.ts.wins + me.ts.losses ? tr(`${conferenceName(userTeam.conference)}第 ${me.rank} 名`, `${ordinal(me.rank)} in the ${conferenceName(userTeam.conference)}`) : tr(`${league.season} 球季還沒開打`, `The ${league.season} season has not started`)} />
        <Stat label={tr("連續", "Streak")} value={streak} tone={streak.startsWith("W") ? "success" : streak.startsWith("L") ? "danger" : undefined} />
        <Stat label={tr("薪資空間", "Cap space")} value={`${space < 0 ? "-" : ""}${money(Math.abs(space))}`} tone={space < 0 ? "danger" : undefined}
          sub={tr(`總薪資 ${money(payroll)} / 上限 ${money(league.settings.salaryCap)}`, `Payroll ${money(payroll)} / cap ${money(league.settings.salaryCap)}`)} />
        <Stat label={tr("下一場", "Next game")} value={next ? `${next.homeTeamId === userTeam.id ? "vs" : "@"} ${teamById.get(next.homeTeamId === userTeam.id ? next.awayTeamId : next.homeTeamId)!.abbrev}` : "—"}
          sub={next ? tr(`第 ${next.day + 1} 天 · ${next.homeTeamId === userTeam.id ? "主場" : "客場"}`, `Day ${next.day + 1} · ${next.homeTeamId === userTeam.id ? "home" : "away"}`) : tr("本季賽程已打完", "No games left this season")} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card title={tr("最近比賽", "Recent games")} action={<Link to={`/l/${league.id}/schedule`} className="text-xs text-accent-text hover:underline">{tr("完整賽程", "Full schedule")}</Link>}>
          {recent.length === 0 ? (
            <p className="text-text-muted">{tr("還沒開打。按右上角「推進」打第一場。", "No games yet. Press Play at the top right for the first one.")}</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {recent.map((g) => (
                <Link key={g.id} to={`/l/${league.id}/game/${g.id}/box`} className="block rounded-lg focus-visible:outline-2" aria-label={tr("查看 box score", "View box score")}>
                  <Scoreboard compact final away={side(g.awayTeamId, g.scoreAway)} home={side(g.homeTeamId, g.scoreHome)} period="" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
        <Card title={tr("收件匣", "Inbox")}>
          {events.length === 0 ? <p className="text-text-muted text-sm">{tr("沒有新消息。", "Nothing new.")}</p> : (
            <div className="-mx-3">
              {events.map((e) => (
                <InboxItem key={e.id} e={{ id: e.id, kind: e.type, title: String(e.payload.text ?? ""), when: tr(`${e.season} 第 ${e.day + 1} 天`, `${e.season}, day ${e.day + 1}`), unread: e.season === league.season && e.day >= league.day - 1 }} />
              ))}
            </div>
          )}
        </Card>
        <Card title={tr(`${conferenceName(userTeam.conference)}排名`, `${conferenceName(userTeam.conference)} standings`)} action={<Link to={`/l/${league.id}/standings`} className="text-xs text-accent-text hover:underline">{tr("全部", "All")}</Link>}>
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
  return <LeagueShell title={tr("球隊總覽", "Team overview")}><Dashboard /></LeagueShell>;
}
