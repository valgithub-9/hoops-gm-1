# Architecture：原創籃球球隊經營模擬（類型參考，非任何特定遊戲的重製）

依據：`replica/recon.md`、`replica/features.csv`
Date：2026-11-23

## 先說結論：第一版不需要後端

recon 已經決定第一版是**單人、存檔放在瀏覽器**。所以 skill 預設的 Postgres、登入、金流、Email 全都用不到，用了反而增加成本和維運負擔。

- 整個遊戲是一個**靜態網站**：HTML + JS，可以免費託管。
- 資料存在瀏覽器的 **IndexedDB**，一個聯盟就是一份存檔，可以匯出或匯入 JSON。
- 比賽模擬在 **Web Worker**（背景執行緒）跑，推進一整季時畫面也不會卡住。
- 「帳號同步」（features.csv 的 could）真的要做時，再加 Supabase。資料結構已經預留（見文末〈未來：雲端同步〉）。

## Stack

| layer | choice | why |
| --- | --- | --- |
| 語言 | TypeScript（strict） | 模擬引擎和薪資規則邊界情況多，型別能擋掉大部分錯誤 |
| 打包 | Vite | 純前端 SPA，不需要 Next.js 的伺服器功能；Worker 支援好、建置快 |
| UI | React 18 | 生態最大，表格、拖放元件現成 |
| 路由 | React Router（hash 或 browser 模式） | 對應 recon 的 20 個畫面路由 |
| 樣式 | Tailwind CSS，tokens 由 /replica-design 產生 | skill 預設，手機與桌機切換方便 |
| 狀態 | Zustand（UI 狀態）+ Dexie liveQuery（資料） | 資料以 IndexedDB 為準，畫面自動跟著更新 |
| 資料庫 | IndexedDB，經由 Dexie.js | 瀏覽器內建、容量大（通常數百 MB 以上）、支援索引與交易 |
| 模擬執行 | Web Worker + Comlink | 模擬與 AI 運算在背景執行緒，主執行緒只負責畫面 |
| 亂數 | 自寫 seeded PRNG（例如 sfc32 / mulberry32） | 同一個 seed 產生同一場比賽，可重現、可除錯；全專案禁用 `Math.random` |
| 拖放 | dnd-kit | 支援觸控和鍵盤，F05 輪替編排要在手機上可用 |
| 圖表 | 輕量 SVG 自畫，或 Recharts | 球員成長曲線、薪資長條圖 |
| 測試 | Vitest（引擎、規則）+ Playwright（流程） | 引擎是純函式，最適合單元測試；Playwright 給 /replica-test |
| 託管 | Cloudflare Pages 或 Vercel（靜態） | 免費、自動 HTTPS、接 GitHub 自動部署 |
| auth／金流／Email | 不使用 | 第一版無帳號、無內購（recon 已排除付費機制） |
| 背景工作 | 不使用伺服器排程 | 遊戲時間由玩家按「推進」驅動，不跟現實時間走 |

## Schema

一個聯盟（League）＝ 一份存檔。所有資料表都有 `leagueId`，這就是這個遊戲的「擁有者欄位」：刪除聯盟時，所有帶這個 `leagueId` 的資料一併刪除。

資料表：**13 張**（League、Team、Player、RatingHistory、Contract、DraftPick、Game、PlayerGameStat、PlayerSeasonStat、TeamSeason、Trade、Award、Event）。完整定義見 `replica/schema.ts`（TypeScript 型別 + Dexie 索引）。

存取規則：**資料層檢查**。單機版沒有其他使用者，所以不需要 RLS。但所有寫入都只能透過 `src/data/` 的函式，畫面元件不直接寫 IndexedDB，交易、簽約這些規則檢查也都集中在資料層。

把 skill 的規則換成瀏覽器版本：

| skill 規則 | 這個專案怎麼做 |
| --- | --- |
| `uuid` 主鍵 | `crypto.randomUUID()` 產生字串 id（之後同步到雲端也不會衝突） |
| `created_at`／`updated_at` | 只有 League 有（存檔的建立與最後遊玩時間，ISO 字串、UTC）。遊戲內資料改用**遊戲時間**：`season` + `day` |
| 擁有者欄位 | 每張表都有 `leagueId` |
| 外鍵與 on delete | IndexedDB 沒有外鍵，改由資料層負責：刪除 League 時，在同一個交易裡刪光 13 張表中該 `leagueId` 的資料；球員退休只標記 `retiredSeason`，不刪除（歷史數據要保留） |
| 外鍵與篩選欄位都要索引 | 見 schema.ts 的 Dexie 索引字串，包含複合索引 `[leagueId+season]` 等 |
| 狀態欄位用 enum／check | TypeScript union type，加上資料層的 runtime 檢查（zod） |
| 時間用 timestamptz UTC | 現實時間只用在存檔資訊（UTC ISO）；遊戲內一律用 `season` + `day` 整數，沒有時區問題 |
| 金額用整數分 | 薪資用**整數「千元」**（遊戲內虛構貨幣，例如 `12500` = 1250 萬），永遠不用小數 |

### 資料庫層級的硬性規則

recon 找到的規則都在資料層強制執行，畫面上的檢查只是提示：

- 每隊名單人數必須介於 `rosterMin` 到 `rosterMax` 之間，否則不能推進日期。
- 同一位球員同時只能有一份有效合約，以 `[playerId+endSeason]` 索引查詢。
- 每個選秀權（`[leagueId+season+round+originalTeamId]`）是唯一的，交易時只改 `ownerTeamId`。
- 交易成交和簽約必須在**同一個 IndexedDB 交易**裡，同時寫入球員、合約、選秀權和 Trade，避免交易只完成一半。
- 每場比賽只會模擬一次：`Game.status` 從 `scheduled` 變成 `final` 時，用同一個交易寫入比分和球員數據；已經是 `final` 的比賽會跳過（見〈The parts that bite〉的冪等性）。

## API

沒有伺服器，所以這裡的「API」分兩層：**頁面路由**，以及**資料層與 Worker 的函式**。

### 頁面路由（20 個）

| path | screen | flow |
| --- | --- | --- |
| `/` | S01 首頁 | F01 |
| `/new` | S02 建立聯盟 | F01 |
| `/l/:leagueId/team` | S03 Dashboard | F02 |
| `/l/:leagueId/roster` | S04 名單 | F05 |
| `/l/:leagueId/player/:id` | S05 球員資料 | — |
| `/l/:leagueId/rotation` | S06 輪替與戰術 | F05 |
| `/l/:leagueId/schedule` | S07 賽程 | F03 |
| `/l/:leagueId/game/:id` | S08 比賽 | F03 |
| `/l/:leagueId/game/:id/box` | S09 Box score | F03 |
| `/l/:leagueId/standings` | S10 排名 | F02 |
| `/l/:leagueId/leaders` | S11 數據排行 | — |
| `/l/:leagueId/trade` | S12 交易 | F04 |
| `/l/:leagueId/trading-block` | S13 交易市場 | F04 |
| `/l/:leagueId/draft` | S14 選秀 | F06 |
| `/l/:leagueId/free-agents` | S15 自由市場 | F07 |
| `/l/:leagueId/finances` | S16 財務 | F07 |
| `/l/:leagueId/playoffs` | S17 季後賽 | F08 |
| `/l/:leagueId/awards` | S18 獎項 | F08 |
| `/l/:leagueId/history` | S19 歷史 | — |
| `/settings` | S20 設定 | — |

### 函式（資料層 `src/data/`、Worker `src/worker/`）

「誰可以呼叫」：單機版只有玩家本人。這一欄改成標示**在哪裡執行**，以及**玩家能不能直接觸發**。

**F01 開新聯盟**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `createLeague` | 產生球隊、球員、合約、選秀權、賽程，寫入 DB | Worker | `{name, numTeams, userTeamIndex, difficulty, seed}` | `leagueId` |
| `listLeagues` | 存檔列表 | 主執行緒 | — | `League[]` |
| `deleteLeague` | 刪除整份存檔（13 張表） | 主執行緒 | `leagueId` | — |
| `exportLeague` / `importLeague` | JSON 匯出／匯入，含 `schemaVersion` | 主執行緒 | `leagueId` / 檔案 | 檔案 / `leagueId` |

**F02 推進賽季（核心）**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `advance` | 一天一天模擬，直到目標日或遇到需要玩家決定的事件 | Worker | `{leagueId, until: 'day'｜'week'｜'deadline'｜'playoffs'｜'phaseEnd'}` | `{stoppedAt, reason, events[]}` |
| `cancelAdvance` | 中途停止（目前這一天跑完才停） | Worker | — | — |
| `validateCanAdvance` | 名單人數、輪替合法性 | 主執行緒 | `leagueId` | `Problem[]` |
| `getDashboard` | 戰績、下一場、薪資、未讀通知 | 主執行緒 | `leagueId` | DTO |

**F03 看比賽**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `simGame` | 單場模擬（純函式，引擎核心） | Worker | `{home, away, seed, options}` | `{score, playerStats, playByPlay?}` |
| `getGame` / `getBoxScore` | 讀取已完成比賽 | 主執行緒 | `gameId` | DTO |
| `replayGame` | 用同一個 seed 重跑，產生逐球紀錄（沒有存逐球紀錄時使用） | Worker | `gameId` | `PlayByPlay[]` |

**F04 交易**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `valuePlayer` / `valuePick` | 資產價值模型（年齡、能力、潛力、合約、球隊策略） | Worker | id + 評估方 team | number |
| `evaluateTrade` | AI 判斷接受、拒絕或還價，附理由 | Worker | `{leagueId, offer}` | `{decision, reason, counter?}` |
| `validateTrade` | 薪資配對、名單人數、交易截止日 | 主執行緒（共用規則模組） | offer | `Problem[]` |
| `executeTrade` | 單一交易內轉移球員、合約與選秀權 | 主執行緒 | offer | `tradeId` |
| `aiTradeProposals` | 電腦球隊主動報價（could） | Worker，`advance` 期間 | leagueId | `Event[]` |

**F05 輪替**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `getRotation` / `saveRotation` | 先發、上場分鐘數（總和 240）、戰術 | 主執行緒 | `{teamId, rotation}` | — / `Problem[]` |
| `autoRotation` | 依能力自動排輪替（AI 球隊也用） | 共用 | teamId | rotation |

**F06 選秀**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `generateDraftClass` | 產生新秀（每季一次） | Worker | `{leagueId, season}` | — |
| `runLottery` | 選秀樂透 | Worker | leagueId | 順位表 |
| `draftPlayer` | 選人，並產生新秀合約 | 主執行緒 | `{pickId, playerId}` | — |
| `aiDraftUntilUser` | AI 選到輪到玩家為止 | Worker | leagueId | picks |

**F07 自由市場**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `listFreeAgents` | 自由球員與要價 | 主執行緒 | leagueId | `Player[]` |
| `offerContract` | 出價，球員依要價、球隊狀況和競爭報價決定 | Worker | `{playerId, years, salary}` | `{accepted, reason}` |
| `capSpace` | 薪資空間與例外條款計算 | 共用規則模組 | teamId | number |

**F08 跨年度**

| function | does | where | input | output |
| --- | --- | --- | --- | --- |
| `startPlayoffs` / `simPlayoffs` | 產生對戰組合並模擬系列賽 | Worker | leagueId | bracket |
| `computeAwards` | 年度獎項 | Worker | `{leagueId, season}` | `Award[]` |
| `progressPlayers` | 成長、老化、退休 | Worker | leagueId | 變化摘要 |
| `expireContracts` / `newSeason` | 合約到期、轉成自由球員、產生新賽程 | Worker | leagueId | — |

Webhooks in／out：**無**。
排程工作：**無伺服器排程**。所有「時間經過」都由 `advance` 驅動。
外部 API：**無**。不呼叫任何第三方或原作的服務。

## The parts that bite

- **可重現（determinism）**：每場比賽的 seed = `hash(league.seed, season, gameId)`，引擎只能用傳進來的 PRNG。CI 加一個測試：同一個 seed 跑兩次，結果必須完全相同。
- **效能**：30 隊打 82 場，一季 1,230 場。目標是一整季模擬 10 秒內完成（中階手機 30 秒內）。做法：模擬時不存逐球紀錄（要看時再用 seed 重跑），每模擬完一天才批次寫入一次 DB，Worker 內快取球員資料。
- **IndexedDB 索引陷阱**：布林值和 `null` 不能當索引鍵，含有這些值的資料會**默默從複合索引消失**，查詢結果就少了。所以要索引的旗標一律用 `0 | 1`；自由球員的 `teamId` 用 `"FA"`，現役球員的 `retiredSeason` 用 `0`（見 schema.ts）。
- **冪等性**：`advance` 被重複觸發（連點、兩個分頁）時，已經是 `final` 的比賽一律跳過；階段轉換（例如例行賽 → 季後賽）先檢查 `phase`，避免重複執行。
- **競態／多分頁**：同一份存檔在兩個分頁同時開啟時，用 Web Locks API（`navigator.locks`）鎖住存檔，第二個分頁只能唯讀，並顯示提示。
- **儲存空間**：呼叫 `navigator.storage.persist()`，避免瀏覽器在空間不足時清掉存檔。每季結束後把逐球紀錄和單場數據壓縮成季數據，可在設定裡調整保留幾季。Safari 的無痕模式和 iOS 的空間限制要另外測。
- **存檔版本遷移**：Dexie `version(n).upgrade()`，匯出的 JSON 帶 `schemaVersion`，匯入舊版時先跑遷移。功能上線後就**不能直接改欄位**，一律寫遷移。
- **時區**：遊戲內沒有現實時間，所以沒有時區問題。每日任務已經不在範圍內，以後要加的話，用玩家本地日期。
- **薪資規則邊界**：交易薪資配對、底薪例外、名單上下限、交易截止日，這些全部放在同一個純函式規則模組 `src/rules/`，主執行緒和 Worker 共用，並且大量單元測試。
- **AI 被玩家鑽漏洞**：價值模型要考慮「兩個爛球員不等於一個好球員」（價值做非線性加權），每次交易都套用 AI 球隊的策略（爭冠或重建），難度越高 AI 越精明。要保留一組「常見騙 AI 交易」的回歸測試。
- **長期平衡**：模擬 20 季自動測試（CI 跑小聯盟），檢查平均總評、得分、薪資總額和球員年齡分布不會隨時間漂移。
- **檔案大小**：匯入 JSON 設上限（例如 100 MB），先驗證 schema 再寫入。匯入的檔案視為不可信資料，用 zod 驗證，不能執行裡面的任何內容。
- **離線**：天生支援，資料都在本機。加上 PWA 就能完全離線（could）。
- **刪除資料／隱私**：沒有收集任何個人資料。「刪除存檔」就是在同一個交易裡清掉 13 張表中該聯盟的資料；設定頁提供「清除全部」。
- **不適用**：rate limit、Email 寄送、多租戶、搜尋服務、即時同步。

## Build order

### 1. Vertical slice（最小可玩版本）

目標：開聯盟 → 推進 → 看結果，畫面醜沒關係。

- Screens：S01, S02, S03, S04, S07, S09, S10
- Tables：League, Team, Player, Contract（簡化）, Game, PlayerGameStat, TeamSeason
- 函式：`createLeague`、`advance`（只做例行賽）、`simGame`（第一版引擎：以持球回合為單位）、`getDashboard`、`getBoxScore`
- 驗收：開新聯盟，按「推進到季末」，排名和 box score 看起來像籃球；同一個 seed 跑兩次結果相同

### 2. Must-haves（features.csv 的 16 項）

- 2a 名單與輪替：S05, S06，`saveRotation`, `autoRotation`, RatingHistory
- 2b 季後賽與跨年度：S17, S18，`simPlayoffs`, `computeAwards`, `progressPlayers`, `newSeason`, PlayerSeasonStat, Award
- 2c 選秀：S14，DraftPick, `generateDraftClass`, `draftPlayer`, `aiDraftUntilUser`
- 2d 存檔：S20，`exportLeague`, `importLeague`, `deleteLeague`，Web Locks，persist
- 2e 手機寬度可用：所有畫面

### 3. Should-haves

- 交易（S12）＋ 價值模型 ＋ 薪資規則 ＋ 財務頁（S16）：Trade, `evaluateTrade`, `executeTrade`
- 自由市場（S15）：`offerContract`
- 選秀樂透、球探報告（潛力只顯示區間）
- 逐球轉播（S08）、戰術傾向、傷病、數據排行（S11）、通知收件匣（Event）

### 然後 could-haves

交易市場與 AI 主動報價（S13）、歷史與名人堂（S19）、2D 回放、奢侈稅、聯盟編輯器、PWA、帳號同步

### 4. Fixes from replica-entrepreneur

等 `/replica-entrepreneur` 讀完同類遊戲的公開評論後補上。

## 未來：雲端同步（features.csv 的 could，現在不做）

需要時的做法：

- Supabase（Postgres + Auth + RLS）只當**存檔備份**：一張 `saves` 表（`id uuid`, `user_id`, `league_id`, `schema_version`, `blob` 壓縮的 JSON, `updated_at timestamptz`），RLS 規則為 `user_id = auth.uid()`。
- 不把 13 張表搬上雲端。遊戲邏輯仍在本機跑，雲端只存快照，衝突時以最後寫入為準，並提示玩家。
- 因為 id 已經是 UUID，搬上雲端時不用改。
