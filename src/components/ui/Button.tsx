import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover shadow-card",
  secondary: "bg-surface-raised text-text border border-border hover:border-border-input",
  ghost: "text-text-muted hover:text-text hover:bg-surface-raised",
  danger: "bg-danger-solid text-on-danger hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-[32px] px-3 text-xs gap-1",
  md: "h-[40px] px-4 text-sm gap-2",
  lg: "h-[48px] px-5 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap",
        "transition-colors duration-fast ease-brand",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});
