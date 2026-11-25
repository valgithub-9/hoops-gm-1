# Recon map：原創籃球「球隊經營模擬」遊戲（網頁版）

> 這份 recon 拆解的是「籃球 GM／球隊經營模擬」這個**遊戲類型**的系統與玩法，不是 NBA 2K27 本身。
> 2K27 只作為類型參考之一（官網 https://nba.2k.com/2k27/ ，只看公開介紹）。
> 不取用任何 2K／NBA 的名稱、球員、球隊、Logo、美術、介面、文案或數值。

Scope：單人模式。在原創虛構聯盟接手一支球隊，經歷選秀、自由市場、交易、薪資空間、模擬賽季和季後賽，一年接一年經營下去。
For：原創網頁遊戲，先做給自己和朋友玩，之後可當產品上架（定位待 /replica-entrepreneur）。
Date：2026-11-22
Platform：網頁（桌機優先，手機寬度可用），之後可包成 PWA。

## Sources

類型層級的公開資料，不登入、不抓取任何遊戲。

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | NBA 2K27 官網（類型參考） | https://nba.2k.com/2k27/ | 只看公開模式介紹，確認球隊經營類玩法包含哪些系統 |
| 2 | 類型共通知識 | — | 籃球 GM 遊戲共通的機制：選秀樂透、薪資上限、合約、交易、球員成長與老化、模擬比賽 |
| 3 | 職業籃球公開規則（概念參考） | 待 /replica-architect 前查證 | 薪資上限、新人合約、選秀樂透等概念。會簡化成自己的規則，不照抄任何聯盟的勞資協議 |
| 4 | 你自己的遊玩經驗 | — | 若你玩過同類遊戲，可補充「最喜歡／最討厭」的部分 |

## Core loop

接手一支虛構球隊，靠選秀、簽約和交易組出冠軍陣容，模擬比賽看結果，球員一年年成長老化，再為下一季做決定。

年度循環：**例行賽 → 交易截止日 → 季後賽 → 選秀 → 自由市場 → 訓練營 → 新賽季**

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | 首頁 | `/` | 開新聯盟、繼續存檔 | 存檔列表、主按鈕 | 無存檔、有存檔 |
| S02 | 建立聯盟 | `/new` | 選聯盟規模（隊數）、選接手球隊、難度、隨機種子 | 表單、球隊選擇格、難度滑桿 | 填寫中、產生中、完成 |
| S03 | 球隊主畫面（Dashboard） | `/team` | 戰績、下一場、薪資狀況、通知、推進按鈕 | 數值卡、通知列表、「推進到…」按鈕 | 例行賽、季後賽、休賽季 |
| S04 | 球隊名單 | `/roster` | 球員列表、合約、能力、傷病 | 可排序表格、徽章、篩選 | 正常、超過名額、有傷兵 |
| S05 | 球員資料 | `/player/:id` | 能力值、潛力、生涯數據、合約、成長趨勢 | 能力條、數據表、成長曲線 | 新秀、巔峰、老化、受傷 |
| S06 | 輪替與戰術 | `/rotation` | 先發、上場時間分配、戰術傾向 | 拖放列表、分鐘數滑桿、戰術選單 | 位置不符、分鐘數超過 240 |
| S07 | 賽程 | `/schedule` | 全季賽程與結果 | 日曆／列表、比分 | 未開打、已完成 |
| S08 | 比賽 | `/game/:id` | 逐球文字轉播 + 比分（可跳過） | 比分板、逐球紀錄、速度控制 | 進行中、快轉、結束 |
| S09 | Box score | `/game/:id/box` | 單場數據 | 雙隊數據表 | — |
| S10 | 聯盟排名 | `/standings` | 分區、勝率、勝差 | 排名表 | 季中、季後賽席位確定 |
| S11 | 數據排行 | `/leaders` | 得分、籃板、助攻等排行 | 排行表、篩選 | — |
| S12 | 交易 | `/trade` | 組交易提案、AI 評估接受與否 | 雙欄資產選擇、薪資對比、AI 回應 | 不平衡、超過上限、接受、拒絕 |
| S13 | 交易市場 | `/trading-block` | 掛牌球員、收報價 | 球員列表、報價列表 | 無報價、有報價 |
| S14 | 選秀 | `/draft` | 樂透、選秀順位、新秀情報、選人 | 新秀列表、球探報告、倒數、順位表 | 樂透前、選秀中、輪到你、完成 |
| S15 | 自由市場 | `/free-agents` | 簽自由球員、出價 | 球員列表、合約出價表單、薪資空間 | 有空間、超過上限、被拒、簽下 |
| S16 | 財務 | `/finances` | 薪資總表、上限、奢侈稅、未來承諾 | 薪資表、年度長條圖 | 低於上限、超過上限、奢侈稅 |
| S17 | 季後賽 | `/playoffs` | 對戰樹與系列賽 | 對戰樹 | 進行中、淘汰、冠軍 |
| S18 | 賽季回顧／獎項 | `/awards` | MVP、新人王、最佳陣容、冠軍 | 獎項卡 | — |
| S19 | 歷史 | `/history` | 歷年冠軍、球隊紀錄、名人堂 | 表格 | 第一季（空）、多季 |
| S20 | 設定 | `/settings` | 模擬速度、存檔匯出匯入、刪除 | 開關、檔案按鈕 | 一般、確認刪除 |

## Flows

```
F01 開新聯盟
    S01 -> S02 -> （產生聯盟） -> S03
    happy path clicks: 3
    edge: 產生中關閉頁面、自訂隊數、存檔空間不足

F02 推進賽季（核心）
    S03 -> 「推進一天／一週／到交易截止日／到季後賽」 -> S03（通知：傷病、交易報價、里程碑）
    happy path clicks: 1
    edge: 推進中有需要你決定的事件（傷病、報價）會暫停、陣容不合法時禁止推進

F03 看一場比賽
    S07 -> S08 -> S09
    happy path clicks: 2
    edge: 跳過、重新整理、比賽已模擬過

F04 提出交易
    S03 -> S12 -> 選對手球隊 -> 選雙方資產（球員、選秀權） -> 送出 -> AI 回應
    happy path clicks: 5
    edge: 薪資不平衡、名單超額、交易截止日後、AI 還價

F05 調整輪替
    S03 -> S06 -> 拖放 + 調分鐘數 -> 儲存
    happy path clicks: 3
    edge: 傷兵在名單、分鐘數總和不是 240、手機上的拖放

F06 選秀
    S03 -> S14 -> 樂透抽籤 -> 看球探報告 -> 輪到你時選人
    happy path clicks: 3
    edge: 自動選秀、交易選秀權、潛力是隱藏的（只有估計值）

F07 自由市場簽約
    S03 -> S15 -> 選球員 -> 出價（年數、年薪） -> 球員決定
    happy path clicks: 4
    edge: 薪資空間不足、其他球隊出價更高、底薪例外

F08 跨年度
    S17（季後賽結束） -> S18 -> S14 -> S15 -> 訓練營（球員成長／老化／退休） -> 新賽季
    edge: 合約到期、球員退休、名單不足最低人數
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | all |
| 推進按鈕 AdvanceMenu | 一天、一週、到下個階段 | 可用、被事件阻擋、推進中 | S03，頂部欄 |
| 資料表 DataTable | 名單、數據、排名、薪資 | 排序、篩選、空、手機橫向滑動 | S04, S09, S10, S11, S16 |
| 球員列 PlayerRow | 精簡、完整 | 一般、受傷、合約到期 | 多處 |
| 能力條 RatingBar | 單項、總評、潛力（區間） | 一般、成長、衰退 | S05, S14 |
| 合約標籤 | 年數 / 年薪 | 新秀約、即將到期、球員選項 | S04, S15, S16 |
| 交易面板 TradePanel | — | 不平衡、合法、AI 回應中 | S12 |
| 比分板 | 完整、精簡 | 進行中、結束 | S07, S08 |
| 逐球紀錄 | — | 串流中、暫停 | S08 |
| 對戰樹 Bracket | — | — | S17 |
| 通知 Inbox | 傷病、報價、里程碑、合約 | 未讀、已讀 | S03 |
| Modal / Toast | 確認、錯誤、事件 | — | all |
| 導覽 | 側欄（桌機）、底部（手機） | 目前頁 | all |

## Inferred data model

這是類型通用的設計，不是某款遊戲的真實資料結構，全部標為設計推測。

```
League        id, name, seed, num_teams, difficulty, season_year, phase
              (regular | trade_deadline | playoffs | draft | free_agency | training_camp),
              current_day, settings(json: 薪資上限、奢侈稅線、名單上下限)
              confidence: high

Team          id, league_id, city, name, abbrev, colors, conference, division,
              is_user, strategy(contending | rebuilding)
              note: 全部原創虛構城市與隊名
              confidence: high

Player        id, league_id, team_id(null = 自由球員), name, born_year, position,
              height_cm, ratings(json: 投射、三分、切入、組織、籃板、防守、體能…),
              overall, potential(隱藏), injury(json), retired_year
              note: 程序產生，不對應任何真人
              confidence: high

RatingHistory player_id, season, ratings(json), overall
              evidence: S05 成長曲線
              confidence: medium

Contract      id, player_id, team_id, salary_per_year, start_season, end_season,
              type(rookie | standard | minimum), option(json)
              evidence: S04, S15, S16
              confidence: high

DraftPick     id, league_id, season, round, original_team_id, owner_team_id, pick_no
              evidence: S12（可交易）, S14
              confidence: high

Game          id, league_id, season, day, home_team_id, away_team_id, seed,
              score_home, score_away, is_playoff, play_by_play(json, 可選擇不存)
              confidence: high

PlayerGameStat game_id, player_id, team_id, min, pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, pf
              evidence: S09
              confidence: high

PlayerSeasonStat player_id, season, team_id, gp, 各項總計（由單場彙總）
              confidence: high

Trade         id, league_id, season, day, team_a, team_b, assets_a(json), assets_b(json), status
              confidence: high

Award         league_id, season, type(MVP | ROY | ALL_LEAGUE…), player_id / team_id
              confidence: high

Event         id, league_id, season, day, type, payload(json), read
              evidence: S03 通知
              confidence: medium
```

Relationships：League 1-n Team, Team 1-n Player, Player 1-n Contract, Team 1-n DraftPick（擁有）, League 1-n Game, Game 1-n PlayerGameStat, Player 1-n PlayerSeasonStat, League 1-n Trade, League 1-n Award。

存放：一個聯盟就是一份存檔。第一版建議全放瀏覽器（IndexedDB），可匯出 JSON；帳號同步列為 could。

## Feature matrix

See `features.csv`. Must: 16, should: 11, could: 7, skip: 6.

## Out of scope (cannot or should not be cloned)

- **NBA／NBPA 授權**：真實球隊、城市隊名組合、球員姓名、肖像、真實數據，全部改用原創、程序產生的聯盟。
- **2K 自有的東西**：遊戲名稱、模式名稱（MyGM／MyLEAGUE 等）、介面、美術、音樂、文案、劇情、數值公式。
- **真實聯盟的勞資協議細節**：只取「薪資上限、新秀約、選秀樂透」這類通用概念，規則自己設計並簡化。
- **3D 即時操控比賽**：主機 AAA 規模，改用文字模擬比賽（可加 2D 回放）。
- **線上多人聯盟**：需要伺服器同步、權限和防作弊，第一版不做。
- **付費機制**：類型裡常見的內購或抽卡不納入，第一版免費、無內購。

## Size

Screens 20，flows 8，entities 12。

Hard parts：
1. **比賽模擬引擎**：要讓能力值、輪替和戰術真的影響結果，數據分布要像真的籃球（得分、命中率、上場時間），一季上千場還要跑得快。必須可用 seed 重現。
2. **AI 球隊經營**：電腦球隊要會交易、簽約、選秀，判斷交易價值，不能被玩家輕易占便宜（球員價值模型）。
3. **球員生成、成長與老化**：程序產生的球員要分布合理，潛力、成長曲線和退休要讓聯盟長期經營下去也不失衡。

另外：薪資上限規則的邊界情況很多，存檔資料量會隨賽季增加（需要清理舊的逐球紀錄）。

Size：**M**（幾週）。最小可玩版本（F01–F03 + F05：開聯盟、推進賽季、看比賽、調輪替）大約一到兩週。
