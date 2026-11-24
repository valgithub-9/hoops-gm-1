import { Languages } from "lucide-react";
import { chooseLang, lang } from "../../i18n";
import { cn } from "../../lib/cn";

/** Switches between English and Chinese. Labels are in the language you would switch to. */
export function LangToggle({ className }: { className?: string }) {
  const next = lang() === "en" ? "zh" : "en";
  return (
    <button
      type="button"
      onClick={() => chooseLang(next)}
      lang={next === "zh" ? "zh-Hant" : "en"}
      aria-label={next === "zh" ? "切換成中文" : "Switch to English"}
      className={cn("inline-flex items-center gap-1 rounded-md px-2 h-[32px] text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-raised", className)}
    >
      <Languages className="size-4" aria-hidden />
      {next === "zh" ? "中文" : "EN"}
    </button>
  );
}
