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
import { PlayerPage } from "./pages/league/PlayerPage";
import { RotationPage } from "./pages/league/RotationPage";
import { PlayoffsPage } from "./pages/league/PlayoffsPage";
import { DraftPage } from "./pages/league/DraftPage";
import { AwardsPage } from "./pages/league/AwardsPage";
import { HistoryPage } from "./pages/league/HistoryPage";
import { TradePage } from "./pages/league/TradePage";
import { FreeAgentsPage } from "./pages/league/FreeAgentsPage";
import { FinancesPage } from "./pages/league/FinancesPage";

const LeagueIndex = () => <Navigate to={`/l/${useParams().leagueId}/team`} replace />;

// Every screen from replica/recon.md has a route; unbuilt ones are labelled stubs.
const soon: [string, string, string, string][] = [
  ["game/:gameId", "比賽", "S08", "逐球文字轉播。"],
  ["leaders", "數據排行", "S11", "得分、籃板、助攻等聯盟排行。"],
  ["trading-block", "交易市場", "S13", "掛牌球員、接收報價。"],
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
      <Route path="/l/:leagueId/player/:playerId" element={<PlayerPage />} />
      <Route path="/l/:leagueId/rotation" element={<RotationPage />} />
      <Route path="/l/:leagueId/playoffs" element={<PlayoffsPage />} />
      <Route path="/l/:leagueId/draft" element={<DraftPage />} />
      <Route path="/l/:leagueId/awards" element={<AwardsPage />} />
      <Route path="/l/:leagueId/history" element={<HistoryPage />} />
      <Route path="/l/:leagueId/trade" element={<TradePage />} />
      <Route path="/l/:leagueId/free-agents" element={<FreeAgentsPage />} />
      <Route path="/l/:leagueId/finances" element={<FinancesPage />} />
      {soon.map(([path, title, id, about]) => (
        <Route key={path} path={`/l/:leagueId/${path}`} element={<ComingSoon title={title} screen={id} about={about} />} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
