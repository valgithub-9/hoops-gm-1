import { ArrowLeftRight, HeartCrack, Trophy, FileSignature } from "lucide-react";
import { cn } from "../../lib/cn";

const kinds = {
  injury: { icon: HeartCrack, cls: "text-danger" },
  trade_offer: { icon: ArrowLeftRight, cls: "text-info" },
  milestone: { icon: Trophy, cls: "text-scoreboard" },
  contract: { icon: FileSignature, cls: "text-warning" },
};
export type InboxEntry = { id: string; kind: keyof typeof kinds; title: string; when: string; unread?: boolean; blocks?: boolean };

export function InboxItem({ e }: { e: InboxEntry }) {
  const K = kinds[e.kind];
  return (
    <button type="button" className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-raised">
      <K.icon className={cn("size-4 mt-[2px] shrink-0", K.cls)} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className={cn("block truncate text-sm", e.unread ? "text-text font-semibold" : "text-text-muted")}>{e.title}</span>
        <span className="block text-xs text-text-subtle">{e.when}{e.blocks && " · 需要你決定"}</span>
      </span>
      {e.unread && <span className="mt-2 size-2 rounded-full bg-accent shrink-0" aria-label="未讀" />}
    </button>
  );
}
