import { DEFAULT_THEME_SETTINGS, PALETTES } from "@/lib/palettes";

const STORAGE_KEY = "alan-os-theme";

// Kept in sync with LEGACY_PALETTE_MAP in src/lib/palettes.ts. It has to be
// duplicated here because this runs as a raw string of JS before any module
// loads — but the *valid* id list below is generated from PALETTES, so adding
// a theme can never leave this script out of date.
const LEGACY_PALETTE_MAP: Record<string, string> = {
  "british-racing-green": "verdigris",
  "navy-cream": "blueprint",
  "burgundy-sand": "oxblood",
  "charcoal-ice": "ink",
  "forest-moss": "verdigris",
  "terracotta-bone": "concrete",
  "teal-mist": "verdigris",
  "plum-blush": "oxblood",
  "amber-ink": "concrete",
  "rose-linen": "oxblood",
  "mono-graphite": "monolith",
};

const VALID_PALETTES = PALETTES.map((p) => p.id);

// Runs before hydration so the correct palette/mode/fonts/density are applied
// on first paint (no flash of default theme). Also migrates a palette id saved
// before the redesign onto its nearest replacement — without this, every
// existing account would flash the default theme on every single page load,
// because their stored id no longer matches any [data-palette] block.
const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var t = stored ? JSON.parse(stored) : ${JSON.stringify(DEFAULT_THEME_SETTINGS)};
    var valid = ${JSON.stringify(VALID_PALETTES)};
    var legacy = ${JSON.stringify(LEGACY_PALETTE_MAP)};
    var palette = t.palette;
    if (valid.indexOf(palette) === -1) {
      palette = legacy[palette] || ${JSON.stringify(DEFAULT_THEME_SETTINGS.palette)};
    }
    var root = document.documentElement;
    var isDark =
      t.mode === "dark" ||
      (t.mode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", isDark);
    root.setAttribute("data-palette", palette);
    root.setAttribute("data-heading-font", t.headingFont || ${JSON.stringify(DEFAULT_THEME_SETTINGS.headingFont)});
    root.setAttribute("data-body-font", t.bodyFont || "inter");
    root.setAttribute("data-font-size", t.fontSize || "md");
    root.setAttribute("data-density", t.density || "comfortable");
    root.setAttribute("data-motion", t.motion || "full");
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export const THEME_STORAGE_KEY = STORAGE_KEY;
