import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ trigger, title, description, children, footer }: {
  trigger: ReactNode; title: string; description?: string; children?: ReactNode; footer?: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-pop">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-lg uppercase tracking-wide">{title}</Dialog.Title>
            <Dialog.Close className="rounded-sm p-1 text-text-muted hover:text-text" aria-label="關閉"><X className="size-4" /></Dialog.Close>
          </div>
          {description && <Dialog.Description className="mt-2 text-sm text-text-muted">{description}</Dialog.Description>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export const ModalClose = Dialog.Close;
