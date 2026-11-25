import { cn } from "../../lib/cn";
import { tr } from "../../i18n";

// 0-100 ratings. Colour bands are tokens; the number is always shown too,
// so colour is never the only signal.
export const ratingTone = (v: number) =>
  v >= 80 ? "elite" : v >= 65 ? "good" : v >= 50 ? "avg" : "poor";
const text = { elite: "text-rating-elite", good: "text-rating-good", avg: "text-rating-avg", poor: "text-rating-poor" };
const chip = {
  elite: "border-rating-elite/40 bg-rating-elite/10",
  good: "border-rating-good/40 bg-rating-good/10",
  avg: "border-rating-avg/40 bg-rating-avg/10",
  poor: "border-rating-poor/40 bg-rating-poor/10",
};
const fill = { elite: "bg-rating-elite", good: "bg-rating-good", avg: "bg-rating-avg", poor: "bg-rating-poor" };

export function RatingBar({ label, value, potential, delta }: {
  label: string; value: number; potential?: [number, number]; delta?: number;
}) {
  const tone = ratingTone(value);
  return (
    <div className="grid grid-cols-[96px_1fr_40px] items-center gap-3">
      <span className="text-xs text-text-muted truncate">{label}</span>
      <div
        className="relative h-[8px] rounded-full bg-surface-raised overflow-hidden"
        role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      >
        {potential && (
          <div
            className="absolute inset-y-0 bg-text/10 border-x border-text/30"
            style={{ left: `${potential[0]}%`, width: `${potential[1] - potential[0]}%` }}
            title={tr(`潛力估計 ${potential[0]}–${potential[1]}`, `Scouted potential ${potential[0]}–${potential[1]}`)}
          />
        )}
        <div className={cn("h-full rounded-full", fill[tone])} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("num text-right font-mono text-sm font-bold", text[tone])}>
        {value}
        {delta ? <sup className={cn("ml-px text-[10px]", delta > 0 ? "text-success" : "text-danger")}>{delta > 0 ? `+${delta}` : delta}</sup> : null}
      </span>
    </div>
  );
}

export function Ovr({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const tone = ratingTone(value);
  return (
    <span
      className={cn(
        "num inline-grid place-items-center rounded-md border font-display font-bold",
        size === "sm" && "size-[28px] text-xs", size === "md" && "size-[36px] text-base", size === "lg" && "size-[56px] text-xl",
        text[tone], chip[tone],
      )}
      aria-label={tr(`總評 ${value}`, `Overall ${value}`)}
    >
      {value}
    </span>
  );
}
