import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FastForward, Play } from "lucide-react";
import { Button } from "./Button";

const options = [
  { id: "day", label: "推進一天" },
  { id: "week", label: "推進一週" },
  { id: "deadline", label: "到交易截止日" },
  { id: "playoffs", label: "到季後賽" },
] as const;

// The core action of the game (F02). Blocked state explains why.
export function AdvanceMenu({ onAdvance, busy, blockedReason }: {
  onAdvance: (until: (typeof options)[number]["id"]) => void; busy?: boolean; blockedReason?: string;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex">
        <Button className="rounded-r-none" loading={busy} disabled={!!blockedReason} onClick={() => onAdvance("day")}>
          {!busy && <Play className="size-4" aria-hidden />}
          {busy ? "模擬中…" : "推進"}
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button className="rounded-l-none border-l border-on-accent/20 px-2" disabled={busy || !!blockedReason} aria-label="更多推進選項">
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
      {blockedReason && <p className="text-xs text-warning" role="status">{blockedReason}</p>}
    </div>
  );
}
