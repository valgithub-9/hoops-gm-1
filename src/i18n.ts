// Two languages, chosen by the player. Strings are written in place as tr("中文", "English"),
// so each sentence keeps both versions side by side and nothing can go missing.
export type Lang = "zh" | "en";
const KEY = "hoopsgm.lang";
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch { /* storage blocked: fall through */ }
  const preset = import.meta.env.VITE_DEFAULT_LANG;
  if (preset === "zh" || preset === "en") return preset;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return /^zh/i.test(nav) ? "zh" : "en";
}

// The sim worker has no localStorage; it is told the language with every request.
let current: Lang = typeof localStorage !== "undefined" ? detect() : "zh";

export const lang = () => current;
export const tr = (zh: string, en: string) => (current === "en" ? en : zh);

/** For the worker: follow the language of the request. */
export function useLangFrom(l: Lang) { current = l; }

/** The player's choice: remembered in this browser, and the whole app re-renders. */
export function chooseLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* not remembered, still applied */ }
  if (typeof document !== "undefined") document.documentElement.lang = l === "zh" ? "zh-Hant" : "en";
  listeners.forEach((f) => f());
}

export const subscribeLang = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** "1st", "2nd" ... in English; the number alone in Chinese contexts that add their own words. */
export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};
