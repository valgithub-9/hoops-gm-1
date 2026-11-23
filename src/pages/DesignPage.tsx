import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "../components/ui/AppShell";
import { AdvanceMenu } from "../components/ui/AdvanceMenu";
import { Badge } from "../components/ui/Badge";
import { Bracket } from "../components/ui/Bracket";
import { Button } from "../components/ui/Button";
import { Card, Stat } from "../components/ui/Card";
import { ContractTag, money } from "../components/ui/ContractTag";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Field";
import { InboxItem } from "../components/ui/Inbox";
import { Modal, ModalClose } from "../components/ui/Modal";
import { PlayByPlay } from "../components/ui/PlayByPlay";
import { PlayerRow, type PlayerSummary } from "../components/ui/PlayerRow";
import { Ovr, RatingBar } from "../components/ui/RatingBar";
import { Scoreboard } from "../components/ui/Scoreboard";
import { TeamChip } from "../components/ui/TeamChip";
import { Toast } from "../components/ui/Toast";
import { TradePanel } from "../components/ui/TradePanel";
import tokens from "../../replica/design/tokens.json";

// Sample data: fictional teams and generated-style names only.
const roster: PlayerSummary[] = [
  { id: "1", name: "Darnell Okafor", pos: "PG", age: 26, ovr: 84, salary: 32500, years: 3 },
  { id: "2", name: "Mateo Lindqvist", pos: "SF", age: 22, ovr: 71, salary: 6200, years: 2 },
  { id: "3", name: "Jalen Whitcombe", pos: "C", age: 31, ovr: 66, salary: 18000, years: 1, expiring: true, injuredGames: 6 },
  { id: "4", name: "Rui Tanaka-Brooks", pos: "SG", age: 24, ovr: 58, salary: 2100, years: 2 },
  { id: "5", name: "Cyrus Adebayo-Kent", pos: "PF", age: 35, ovr: 47, salary: 1200, years: 1 },
];
const cols: Column<PlayerSummary>[] = [
  { key: "name", header: "球員", sticky: true, cell: (p) => <span className="font-medium">{p.name}</span>, sortValue: (p) => p.name },
  { key: "pos", header: "位置", cell: (p) => p.pos },
  { key: "age", header: "年齡", numeric: true, cell: (p) => p.age, sortValue: (p) => p.age },
  { key: "ovr", header: "總評", numeric: true, cell: (p) => <Ovr value={p.ovr} size="sm" />, sortValue: (p) => p.ovr },
  { key: "sal", header: "年薪", numeric: true, cell: (p) => money(p.salary), sortValue: (p) => p.salary },
  { key: "st", header: "狀態", cell: (p) => (p.injuredGames ? <Badge tone="danger">傷 {p.injuredGames}</Badge> : <Badge tone="success">健康</Badge>) },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-[72px] space-y-4">
      <h2 className="font-display text-xl uppercase tracking-wide border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}

export function DesignPage() {
  const [busy, setBusy] = useState(false);
  const advance = () => { setBusy(true); setTimeout(() => setBusy(false), 1200); };

  return (
    <AppShell title="設計系統" actions={<AdvanceMenu busy={busy} onAdvance={advance} />}>
      <div className="space-y-8">
        <Section id="colors" title="顏色角色">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(tokens.color).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border overflow-hidden bg-surface">
                <div className="h-[48px]" style={{ background: v }} />
                <div className="px-2 py-1"><div className="text-xs text-text truncate">{k}</div><div className="num font-mono text-xs text-text-subtle">{v}</div></div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="字體">
          <Card>
            <div className="space-y-2">
              <div className="font-display text-display uppercase">Night Game 夜賽</div>
              <div className="font-display text-xl uppercase">標題 Display · Oswald</div>
              <div className="text-lg font-semibold">小標 Lg · Inter 600</div>
              <div className="text-base">內文 Base 16 — 每個數字都等寬對齊：<span className="num font-mono">1,230 場 · 112.4 分</span></div>
              <div className="text-sm text-text-muted">輔助文字 Sm · text-muted</div>
              <div className="text-xs text-text-subtle">註解 Xs · text-subtle</div>
            </div>
          </Card>
        </Section>

        <Section id="buttons" title="按鈕">
          <div className="flex flex-wrap items-center gap-3">
            <Button><Plus className="size-4" aria-hidden />主要</Button>
            <Button variant="secondary">次要</Button>
            <Button variant="ghost">幽靈</Button>
            <Button variant="danger"><Trash2 className="size-4" aria-hidden />刪除存檔</Button>
            <Button loading>載入中</Button>
            <Button disabled>停用</Button>
            <Button size="sm">小</Button>
            <Button size="lg">大按鈕</Button>
          </div>
          <div className="flex flex-wrap gap-6 items-start">
            <AdvanceMenu onAdvance={() => {}} />
            <AdvanceMenu onAdvance={() => {}} blockedReason="名單只有 12 人，最少需要 13 人" />
          </div>
        </Section>

        <Section id="dashboard" title="主畫面元件">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="戰績" value="34–18" sub="東區第 3" />
            <Stat label="連勝" value="W5" tone="success" />
            <Stat label="薪資空間" value="-$4.2M" tone="danger" sub="超過上限" />
            <Stat label="下一場" value="vs HRB" sub="第 53 天 · 主場" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Scoreboard
              away={{ abbrev: "HRB", name: "Harbor Owls", primary: "#2b7a78", score: 98, record: "29–23" }}
              home={{ abbrev: "MSA", name: "Mesa Comets", primary: "#f2c14e", score: 104, record: "34–18" }}
              period="第 4 節" clock="2:41" />
            <Scoreboard final
              away={{ abbrev: "PIN", name: "Pinecrest Lynx", primary: "#3d2c8d", score: 117 }}
              home={{ abbrev: "MSA", name: "Mesa Comets", primary: "#f2c14e", score: 109 }}
              period="" />
          </div>
          <Card title="通知" action={<Badge tone="accent">3 未讀</Badge>}>
            <div className="-mx-3">
              <InboxItem e={{ id: "a", kind: "trade_offer", title: "Harbor Owls 想用首輪籤換 Mateo Lindqvist", when: "第 52 天", unread: true, blocks: true }} />
              <InboxItem e={{ id: "b", kind: "injury", title: "Jalen Whitcombe 腳踝扭傷，預計缺席 6 場", when: "第 51 天", unread: true }} />
              <InboxItem e={{ id: "c", kind: "milestone", title: "Darnell Okafor 生涯第 10,000 分", when: "第 49 天", unread: true }} />
              <InboxItem e={{ id: "d", kind: "contract", title: "2 份合約將在季末到期", when: "第 40 天" }} />
            </div>
          </Card>
        </Section>

        <Section id="roster" title="名單與球員">
          <DataTable caption="球隊名單" rows={roster} columns={cols} rowKey={(p) => p.id} initialSort={{ key: "ovr", dir: "desc" }} />
          <DataTable caption="空名單" rows={[]} columns={cols} rowKey={(p) => p.id} empty="自由市場還沒有球員。推進到休賽季後會出現。" />
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="球員列">
              <div className="-mx-3">{roster.slice(0, 3).map((p) => <PlayerRow key={p.id} p={p} />)}</div>
            </Card>
            <Card title="能力值" action={<Ovr value={71} size="lg" />}>
              <div className="space-y-3">
                <RatingBar label="三分" value={82} delta={3} />
                <RatingBar label="切入" value={68} />
                <RatingBar label="組織" value={54} delta={-2} />
                <RatingBar label="內線防守" value={39} />
                <RatingBar label="潛力（估計）" value={71} potential={[74, 86]} />
              </div>
            </Card>
          </div>
          <div className="flex flex-wrap gap-2">
            <ContractTag salary={32500} years={3} />
            <ContractTag salary={6200} years={2} kind="rookie" />
            <ContractTag salary={1200} years={1} kind="minimum" />
            <ContractTag salary={18000} years={1} expiring />
            <Badge tone="info">交易截止日前</Badge>
            <Badge tone="warning">位置不符</Badge>
          </div>
        </Section>

        <Section id="schedule" title="比賽">
          <PlayByPlay live plays={[
            { id: "1", clock: "2:41", team: "MSA", text: "Okafor 急停跳投命中", score: "98–104", scoring: true },
            { id: "2", clock: "2:58", team: "HRB", text: "籃板：Whitcombe（防守）", score: "98–102" },
            { id: "3", clock: "3:04", team: "HRB", text: "三分出手不進", score: "98–102" },
            { id: "4", clock: "3:22", team: "MSA", text: "Lindqvist 底角三分命中，Okafor 助攻", score: "98–102", scoring: true },
          ]} />
        </Section>

        <Section id="trade" title="交易">
          <TradePanel
            a={{ team: "Mesa Comets", assets: [{ id: "p2", label: "Mateo Lindqvist（SF, 71）", salary: 6200 }, { id: "k", label: "2028 次輪籤" }] }}
            b={{ team: "Harbor Owls", assets: [{ id: "p9", label: "Kofi Marchetti（C, 74）", salary: 21000 }] }}
            problems={["薪資差距超過 125% 規則：你會多收 $14.8M"]}
            verdict={{ decision: "counter", reason: "他們要再加一支 2027 首輪籤才願意。" }} />
        </Section>

        <Section id="playoffs" title="季後賽">
          <Bracket rounds={[
            { name: "第一輪", series: [
              { id: "a", a: "MSA", b: "PIN", winsA: 4, winsB: 2 },
              { id: "b", a: "HRB", b: "KST", winsA: 3, winsB: 4 },
            ] },
            { name: "分區決賽", series: [{ id: "c", a: "MSA", b: "KST", winsA: 2, winsB: 1 }] },
          ]} />
        </Section>

        <Section id="settings" title="表單、對話框、提示">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="球隊名稱" hint="最多 24 字">{(f) => <Input id={f.id} aria-describedby={f.describedBy} defaultValue="Mesa Comets" />}</Field>
              <Field label="城市" error="這個名稱已被聯盟內其他球隊使用">{(f) => <Input id={f.id} aria-invalid={f.invalid} aria-describedby={f.describedBy} defaultValue="Harbor" />}</Field>
              <Field label="難度">{(f) => <Select id={f.id} defaultValue="normal"><option value="easy">輕鬆</option><option value="normal">一般</option><option value="hard">困難</option></Select>}</Field>
              <Field label="停用欄位">{(f) => <Input id={f.id} disabled defaultValue="聯盟建立後不能更改" />}</Field>
            </div>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Modal trigger={<Button variant="danger">刪除存檔…</Button>} title="刪除這份存檔？"
              description="「Mesa Comets」的 3 個賽季紀錄會永久刪除，無法復原。"
              footer={<><ModalClose asChild><Button variant="secondary">取消</Button></ModalClose><ModalClose asChild><Button variant="danger">永久刪除</Button></ModalClose></>} />
          </div>
          <div className="flex flex-col gap-3">
            <Toast tone="success" title="交易完成">Kofi Marchetti 已加入 Mesa Comets。</Toast>
            <Toast tone="warning" title="推進已暫停">Harbor Owls 提出交易，需要你回覆。</Toast>
            <Toast tone="error" title="簽約失敗">薪資空間不足 $2.4M。</Toast>
          </div>
          <div className="flex items-center gap-2">
            {["#f2c14e", "#2b7a78", "#3d2c8d", "#e8e8e8", "#7a1f2b"].map((c, i) => <TeamChip key={c} primary={c} abbrev={["MSA", "HRB", "PIN", "GLC", "RDG"][i]} />)}
            <span className="text-xs text-text-muted">隊色由玩家選，文字顏色自動依對比挑選</span>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
