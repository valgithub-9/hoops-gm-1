import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { DesignPage } from "./pages/DesignPage";
import { HomePage } from "./pages/HomePage";
import { NewLeaguePage } from "./pages/NewLeaguePage";
import { NotFound } from "./pages/NotFound";
import { BoxScorePage } from "./pages/league/BoxScorePage";
import { ComingSoon } from "./pages/league/ComingSoon";
import { DashboardPage } from "./pages/league/DashboardPage";
import { RosterPage } from "./pages/league/RosterPage";
import { SchedulePage } from "./pages/league/SchedulePage";
import { StandingsPage } from "./pages/league/StandingsPage";

const LeagueIndex = () => <Navigate to={`/l/${useParams().leagueId}/team`} replace />;

// Every screen from replica/recon.md has a route; unbuilt ones are labelled stubs.
const soon: [string, string, string, string][] = [
  ["player/:playerId", "球員資料", "S05", "各項能力、潛力區間、生涯數據和合約。"],
  ["rotation", "輪替與戰術", "S06", "拖放先發與板凳、分配上場時間、設定戰術傾向。"],
  ["game/:gameId", "比賽", "S08", "逐球文字轉播。"],
  ["leaders", "數據排行", "S11", "得分、籃板、助攻等聯盟排行。"],
  ["trade", "交易", "S12", "用球員和選秀權跟電腦球隊談交易。"],
  ["trading-block", "交易市場", "S13", "掛牌球員、接收報價。"],
  ["draft", "選秀", "S14", "樂透、球探報告、輪流選人。"],
  ["free-agents", "自由市場", "S15", "出價簽下自由球員。"],
  ["finances", "財務", "S16", "薪資總表、上限與奢侈稅。"],
  ["playoffs", "季後賽", "S17", "對戰樹與系列賽。"],
  ["awards", "獎項", "S18", "MVP、新人王、最佳陣容。"],
  ["history", "歷史", "S19", "歷年冠軍與紀錄。"],
];

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<NewLeaguePage />} />
      <Route path="/design" element={<DesignPage />} />
      <Route path="/settings" element={<NotFound what="設定頁還在建置中" />} />
      <Route path="/l/:leagueId" element={<LeagueIndex />} />
      <Route path="/l/:leagueId/team" element={<DashboardPage />} />
      <Route path="/l/:leagueId/roster" element={<RosterPage />} />
      <Route path="/l/:leagueId/schedule" element={<SchedulePage />} />
      <Route path="/l/:leagueId/standings" element={<StandingsPage />} />
      <Route path="/l/:leagueId/game/:gameId/box" element={<BoxScorePage />} />
      {soon.map(([path, title, id, about]) => (
        <Route key={path} path={`/l/:leagueId/${path}`} element={<ComingSoon title={title} screen={id} about={about} />} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
