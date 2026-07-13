// One-off generator: reads palette definitions and prints the CSS variable
// blocks for globals.css. Run with `node scripts/gen-palette-css.mjs` after
// editing src/lib/palettes.ts, then paste the output into globals.css.
import { PALETTES } from "../src/lib/palettes.ts";

function block(selector, c) {
  return `${selector} {
  --background: ${c.background};
  --surface: ${c.surface};
  --foreground: ${c.text};
  --primary: ${c.primary};
  --primary-foreground: ${c.primaryForeground};
  --accent: ${c.accent};
  --accent-foreground: ${c.accentForeground};
  --muted: ${c.muted};
  --muted-foreground: ${c.mutedForeground};
  --border: ${c.border};
}`;
}

let out = "";
for (const p of PALETTES) {
  const lightSel =
    p.id === "british-racing-green"
      ? `:root, :root[data-palette="${p.id}"]`
      : `:root[data-palette="${p.id}"]`;
  const darkSel =
    p.id === "british-racing-green"
      ? `.dark, .dark[data-palette="${p.id}"]`
      : `.dark[data-palette="${p.id}"]`;
  out += block(lightSel, p.light) + "\n\n";
  out += block(darkSel, p.dark) + "\n\n";
}
console.log(out);
