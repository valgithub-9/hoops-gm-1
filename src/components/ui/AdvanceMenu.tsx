import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FastForward, Play } from "lucide-react";
import { Button } from "./Button";
import { tr } from "../../i18n";

export type AdvanceOption = "day" | "week" | "deadline" | "phaseEnd";
const defaultOptions = (): { id: AdvanceOption; label: string }[] => [
  { id: "day", label: tr("推進一天", "Play a day") },
  { id: "week", label: tr("推進一週", "Play a week") },
  { id: "phaseEnd", label: tr("到例行賽結束", "To end of regular season") },
];

// The core action of the game (F02). Blocked state explains why.
export function AdvanceMenu({ onAdvance, onCancel, busy, progress, blockedReason, inHeader, options = defaultOptions() }: {
  onAdvance: (until: AdvanceOption) => void; onCancel?: () => void; busy?: boolean; progress?: string; blockedReason?: string;
  options?: { id: AdvanceOption; label: string }[];
  /** In the 56px header there is no room for the reason line: it goes in the tooltip and screen-reader text. */
  inHeader?: boolean;
}) {
  if (busy && onCancel) {
    return (
      <div className="flex items-center gap-2">
        {progress && <span className="num hidden sm:inline text-xs text-text-muted" role="status">{progress}</span>}
        <Button variant="secondary" loading onClick={onCancel} disabled={false}>{tr("模擬中…", "Simulating…")}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>{tr("停止", "Stop")}</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex">
        <Button className="rounded-r-none" loading={busy} disabled={!!blockedReason} onClick={() => onAdvance(options[0].id)}
          title={blockedReason} aria-describedby={blockedReason ? "advance-blocked" : undefined}>
          {!busy && <Play className="size-4" aria-hidden />}
          {busy ? tr("模擬中…", "Simulating…") : tr("推進", "Play")}
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button className="rounded-l-none border-l border-on-accent/20 px-2" disabled={busy || !!blockedReason} aria-label={tr("更多推進選項", "More advance options")}>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={6} className="min-w-[200px] rounded-md border border-border bg-surface-raised p-1 shadow-pop">
              {options.map((o) => (
                <Menu.Item key={o.id} onSelect={() => onAdvance(o.id)}
                  className="flex items-center gap-2 rounded-sm px-3 h-[36px] text-sm text-text outline-none data-[highlighted]:bg-accent/15 data-[highlighted]:text-accent-text cursor-pointer">
                  <FastForward className="size-4" aria-hidden />{o.label}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      {blockedReason && (
        <p id="advance-blocked" className={inHeader ? "sr-only" : "text-xs text-warning"} role="status">{blockedReason}</p>
      )}
    </div>
  );
}
