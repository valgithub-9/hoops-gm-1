import { readableOn } from "../../lib/color";

// Team colours come from the player's save, so text colour is picked at
// runtime for contrast. Fictional teams only.
export function TeamChip({ abbrev, primary, size = 32 }: { abbrev: string; primary: string; size?: number }) {
  return (
    <span
      className="inline-grid place-items-center rounded-md font-display font-bold shrink-0"
      style={{ background: primary, color: readableOn(primary), width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {abbrev}
    </span>
  );
}
