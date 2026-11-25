import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full h-[40px] rounded-md bg-bg border border-border-input px-3 text-sm text-text placeholder:text-text-subtle " +
  "focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/40 " +
  "aria-[invalid=true]:border-danger disabled:opacity-40";

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">{label}</label>
      {children({ id, describedBy: hint || error ? msgId : undefined, invalid: !!error })}
      {(error || hint) && (
        <p id={msgId} className={cn("text-xs", error ? "text-danger" : "text-text-subtle")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, "appearance-none pr-8", props.className)} />;
}
