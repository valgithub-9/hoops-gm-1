# Components：Hoops GM 設計系統

原創的深色「夜賽球館／計分板」風格。所有顏色、字級、間距都來自 `tokens.json`，元件裡不寫死任何色碼或尺寸。

- 圖示：Lucide（ISC 授權）
- 字體：Inter（UI 與內文）、Oswald（標題與隊名，全大寫）、JetBrains Mono（比分與數據），三者皆為 OFL 授權，以 @fontsource 本地打包，離線也能用；中文退回系統字體 PingFang TC、Noto Sans TC 或微軟正黑體
- 不使用：NBA 或 2K 的 Logo、配色（NBA 紅 #C8102E、藍 #1D428A）、介面版型、卡面、字體、文案
- 預覽：`npm run dev`，打開 `/design`
- 對比度檢查：`npm run contrast`，35 組配色、0 組低於 AA

## 通用規則

- **焦點**：所有可互動元素都有 2px `focus` 色外框（`:focus-visible`）。
- **數字**：凡是數字都加 `.num`（tabular-nums），表格中靠右、用等寬字體。
- **顏色不是唯一訊號**：能力值同時顯示數字，傷病同時有圖示和文字，勝負同時有比分。
- **減少動態**：`prefers-reduced-motion` 時關閉所有動畫。
- **觸控目標**：至少 40px 高（`sm` 按鈕 32px，只用在桌機密集區）。
- **隊色**：由玩家自選，所以文字顏色在執行時依 WCAG 對比自動選深色或白色（`lib/color.ts`）。

## 元件

```
Button
  variants  primary（橘）, secondary, ghost, danger
  sizes     sm 32px, md 40px, lg 48px
  states    default, hover, active, focus-visible, disabled（40% 不透明）, loading（轉圈 + aria-busy，保留文字）
  tokens    bg accent / text on-accent, radius md, font sm/600
  a11y      真正的 <button>，預設 type="button"
  used on   all
```

```
AdvanceMenu（推進按鈕，F02 核心操作）
  parts     主按鈕「推進」（一天）+ 下拉：一週、到交易截止日、到季後賽
  states    可用, 推進中（loading，「模擬中…」）, 被阻擋（停用 + 下方 warning 文字說明原因）
  tokens    Button primary；選單 surface-raised, shadow pop，選中項 accent/15
  a11y      Radix DropdownMenu：方向鍵、Esc、焦點回到觸發鈕；下拉鈕有 aria-label；阻擋原因 role=status
  used on   頂部欄（所有 /l/* 畫面）, S03
```

```
Card / Stat
  Card      surface + border + radius lg；可選標題列（Oswald 全大寫）與右側動作
  Stat      label（xs 大寫 muted）, value（Oswald xl, 可 success/danger）, sub（xs subtle）
  used on   S03, S05, S16, S18
```

```
Scoreboard（招牌元件）
  variants  完整（S08 上方）, compact（S07 賽程列表）
  states    進行中（節數 accent-text + 時間）, 終場（落後方比分 50%）, 平手
  tokens    bg scoreboard-bg, 比分 scoreboard（LED 琥珀色 + 光暈），font mono score 56px
  a11y      role=group，aria-label 讀出完整比分與節數；不靠顏色判斷勝負
  used on   S07, S08, S09
```

```
DataTable
  features  可點表頭排序（aria-sort）, 第一欄 sticky（手機橫向滑動時球員名不消失）, 空狀態文字, 列 hover
  states    空, 有資料, 排序中（表頭 accent-text + 箭頭）
  tokens    surface, border, 表頭 xs 大寫 muted, 列高 44px, 數字欄 mono 靠右
  a11y      <table> + <caption>（sr-only）+ scope=col；排序鈕是 <button>
  used on   S04, S09, S10, S11, S15, S16
```

```
PlayerRow
  parts     Ovr 徽章, 姓名, 位置 · 年齡, 傷病 Badge, ContractTag
  variants  完整, compact（隱藏合約）
  states    一般, 受傷, 合約到期, hover
  used on   S04, S06, S12, S14, S15
```

```
RatingBar / Ovr
  bands     elite ≥80（紫）, good ≥65（綠）, avg ≥50（黃）, poor <50（橘紅）
  RatingBar 標籤 + 條 + 數字；可顯示成長 delta（+3 / -2）與潛力區間（半透明框，只顯示估計範圍）
  Ovr       sm 28 / md 36 / lg 56 方形徽章
  a11y      role=meter + aria-valuenow；Ovr 有 aria-label「總評 N」
  used on   S04, S05, S14
```

```
ContractTag
  format    $32.5M ×3年（金額為整數千元，顯示時換算）
  variants  standard, rookie（新秀約, info）, minimum（底薪）, expiring（warning 外框）
  used on   S04, S05, S15, S16
```

```
Badge
  tones     neutral, accent, success, danger, warning, info（10–15% 底色 + 40% 外框 + 實色文字）
  used on   all
```

```
TradePanel（F04）
  parts     送出／得到兩欄（手機上下排）, 每項資產與薪資, 薪資合計, 問題清單（warning）, AI 回應（接受／拒絕／還價 + 理由）
  states    空, 不合法（列出原因文字）, 等待 AI, 接受, 拒絕, 還價
  a11y      問題清單有 aria-label；AI 回應 role=status
  used on   S12, S13
```

```
PlayByPlay
  columns   時間 | 球隊 | 事件 | 比分
  states    串流中（aria-live=polite）, 暫停, 得分列（文字加亮、比分 scoreboard 色）
  used on   S08
```

```
InboxItem
  kinds     injury（danger）, trade_offer（info）, milestone（scoreboard）, contract（warning）
  states    未讀（粗體 + 橘點，aria-label 未讀）, 已讀, 需要決定（「需要你決定」，會阻擋推進）
  used on   S03
```

```
Bracket
  layout    各輪由左到右，手機橫向捲動
  states    進行中, 系列賽結束（勝方 scoreboard 粗體、敗方 subtle）
  used on   S17
```

```
Field / Input / Select
  parts     label（xs muted）, 控制項 40px, 提示或錯誤訊息
  states    default, focus（focus 外框 + 光暈）, error（danger 外框 + role=alert 訊息）, disabled
  a11y      label htmlFor, aria-describedby 連到提示／錯誤, aria-invalid
  used on   S02, S15, S20
```

```
Modal
  base      Radix Dialog：焦點鎖定、Esc 關閉、焦點回到觸發鈕、背景 bg/80 模糊
  layout    最大 480px，手機留 16px 邊距；標題 Oswald；右上關閉鈕（aria-label 關閉）
  used on   刪除存檔確認, 交易確認, 簽約確認, 選秀確認
```

```
Toast
  tones     success, warning, error（error 用 role=alert，其他 role=status）
  used on   全域（交易完成、推進暫停、簽約失敗）
  note      目前是靜態元件；佇列與自動消失在 /replica-build 加上
```

```
TeamChip
  隊色方塊 + 縮寫（Oswald），文字顏色自動選對比較高者
  used on   Scoreboard, 排名, 交易, 賽程
```

```
AppShell
  desktop   固定側欄 232px（logo + 導覽 + 設定），頂部欄 56px（標題 + AdvanceMenu）
  phone     頂部欄 + 底部導覽 64px（5 項：球隊、名單、賽程、交易、季後賽），內容底部留白避免被遮住
  a11y      <nav aria-label>，目前頁 aria-current=page
  layout    內容最大寬 1280px，左右 16px
```

## 還沒做（交給 /replica-build）

- S02 隊徽產生器、球員頭像產生器（程序產生的原創圖形）
- 拖放輪替（dnd-kit）、分鐘數滑桿
- 球員成長曲線圖、薪資長條圖
- 選秀倒數與順位表
- Toast 佇列
