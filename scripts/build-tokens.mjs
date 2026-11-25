// Generates src/styles/tokens.css from replica/design/tokens.json.
// Colours become RGB channel triplets so Tailwind can apply opacity:
//   --color-accent: 244 122 32;  ->  bg-accent/20
import { readFileSync, writeFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync("replica/design/tokens.json", "utf8"));
const hexToRgb = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};

const lines = [];
for (const [k, v] of Object.entries(tokens.color)) lines.push(`  --color-${k}: ${hexToRgb(v)};`);
for (const [k, v] of Object.entries(tokens.font)) lines.push(`  --font-${k}: ${v};`);
for (const [k, v] of Object.entries(tokens.radius)) lines.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(tokens.shadow)) lines.push(`  --shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(tokens.motion)) lines.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(tokens.layout)) if (typeof v === "number") lines.push(`  --layout-${k}: ${v}px;`);

writeFileSync(
  "src/styles/tokens.css",
  `/* GENERATED from replica/design/tokens.json by scripts/build-tokens.mjs. Do not edit. */\n:root {\n  color-scheme: dark;\n${lines.join("\n")}\n}\n`,
);
console.log(`tokens.css: ${lines.length} custom properties`);
