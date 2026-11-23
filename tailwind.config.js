import tokens from "./replica/design/tokens.json" with { type: "json" };

// Every colour role maps to a CSS variable, so components write
// `bg-surface text-muted`, never raw hex. Names come from tokens.json.
const color = Object.fromEntries(
  Object.keys(tokens.color).map((k) => [k, `rgb(var(--color-${k}) / <alpha-value>)`]),
);
const px = (n) => `${n}px`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    colors: { transparent: "transparent", current: "currentColor", ...color },
    fontFamily: {
      sans: "var(--font-sans)",
      display: "var(--font-display)",
      mono: "var(--font-mono)",
    },
    fontSize: Object.fromEntries(
      Object.entries(tokens.type).map(([k, t]) => [k, [px(t.size), { lineHeight: px(t.line) }]]),
    ),
    // Spacing steps are the token scale by index (4 = 16px, 8 = 64px), plus layout sizes.
    spacing: {
      ...Object.fromEntries(tokens.space.map((v, i) => [i, px(v)])),
      px: "1px",
      sidebar: px(tokens.layout.sidebar),
      header: px(tokens.layout.header),
      "bottom-nav": px(tokens.layout["bottom-nav"]),
    },
    borderRadius: {
      none: "0",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      full: "var(--radius-pill)",
    },
    boxShadow: { none: "none", card: "var(--shadow-card)", pop: "var(--shadow-pop)", glow: "var(--shadow-glow)" },
    screens: Object.fromEntries(Object.entries(tokens.layout.breakpoints).map(([k, v]) => [k, px(v)])),
    extend: {
      maxWidth: { content: px(tokens.layout["content-max"]) },
      transitionDuration: { fast: tokens.motion.fast, base: tokens.motion.base },
      transitionTimingFunction: { brand: tokens.motion.ease },
    },
  },
  plugins: [],
};
