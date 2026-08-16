// ---------------------------------------------------------------------------
// Alan OS palettes — rebuilt for the "Swiss Instrument" design language.
//
// The old 11 palettes were designed for a soft UI: faint hairline borders,
// rounded cards, low-contrast muted grounds. That set actively fights the new
// language, where a card is defined by a *thick high-contrast rule* rather than
// by a fill or a shadow. So the whole set was redesigned rather than retinted.
//
// What each token means in the new language (this differs from before):
//   background  the page ground — paper, or ink in a dark theme
//   surface     a raised panel ground; deliberately CLOSE to background, since
//               separation comes from rules, not from fills
//   foreground  the ink
//   primary     the one signal colour: active nav, meters, the emphasised block
//   accent      the secondary signal, used for a second data series / links
//   rule        HIGH-contrast structural border (near-ink) — the 2px frame
//   hairline    low-contrast separator used *inside* an already-framed panel
//   muted       a quiet fill for chips and inert areas
//
// `rule` and `hairline` are the new pair. Previously there was one `border`
// token doing both jobs at hairline strength, which is exactly why the old UI
// read as weightless.
//
// After editing this file run `node scripts/gen-palette-css.mjs` and paste the
// output into the marked block at the top of globals.css.
// ---------------------------------------------------------------------------

export type PaletteId =
  | "ink"
  | "blueprint"
  | "primary"
  | "concrete"
  | "signal"
  | "verdigris"
  | "oxblood"
  | "monolith";

export interface PaletteColors {
  background: string;
  surface: string;
  text: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  rule: string;
  hairline: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  /** One plain-English line shown under the name in Settings → Appearance. */
  blurb: string;
  light: PaletteColors;
  dark: PaletteColors;
}

export const PALETTES: Palette[] = [
  {
    id: "ink",
    name: "Ink",
    blurb: "Paper, black, one signal red. Swiss editorial.",
    light: {
      background: "#F1F0EC",
      surface: "#FBFAF7",
      text: "#121211",
      primary: "#C4291F",
      primaryForeground: "#FBFAF7",
      accent: "#1F4E8C",
      accentForeground: "#FBFAF7",
      muted: "#E2E1DB",
      mutedForeground: "#5C5C55",
      rule: "#121211",
      hairline: "#CBCAC3",
    },
    dark: {
      background: "#121211",
      surface: "#1A1A18",
      text: "#EDECE7",
      primary: "#EC5A4C",
      primaryForeground: "#121211",
      accent: "#7FA6E0",
      accentForeground: "#121211",
      muted: "#26251F",
      mutedForeground: "#A3A29A",
      rule: "#EDECE7",
      hairline: "#38372F",
    },
  },

  {
    id: "blueprint",
    name: "Blueprint",
    blurb: "Cool paper, navy ink, drafting blue. Technical.",
    light: {
      background: "#EDF1F6",
      surface: "#FAFCFE",
      text: "#0E1A2B",
      primary: "#1B5FBF",
      primaryForeground: "#FAFCFE",
      accent: "#B0431A",
      accentForeground: "#FAFCFE",
      muted: "#DCE3EC",
      mutedForeground: "#4F5D6E",
      rule: "#0E1A2B",
      hairline: "#C2CDDA",
    },
    dark: {
      background: "#0B1420",
      surface: "#121E2E",
      text: "#E5ECF5",
      primary: "#5B9BEA",
      primaryForeground: "#0B1420",
      accent: "#E8845C",
      accentForeground: "#0B1420",
      muted: "#1B2937",
      mutedForeground: "#93A3B5",
      rule: "#E5ECF5",
      hairline: "#27384A",
    },
  },

  {
    id: "primary",
    name: "Primary",
    blurb: "True Bauhaus red and blue on grey. The bold one.",
    light: {
      background: "#F0F0F0",
      surface: "#FFFFFF",
      text: "#121212",
      primary: "#CC1F1F",
      primaryForeground: "#FFFFFF",
      accent: "#1040C0",
      accentForeground: "#FFFFFF",
      muted: "#E1E1E1",
      mutedForeground: "#585858",
      rule: "#121212",
      hairline: "#C8C8C8",
    },
    dark: {
      background: "#0F0F0F",
      surface: "#181818",
      text: "#F0F0F0",
      primary: "#F2564A",
      primaryForeground: "#0F0F0F",
      accent: "#6D91EC",
      accentForeground: "#0F0F0F",
      muted: "#242424",
      mutedForeground: "#9E9E9E",
      rule: "#F0F0F0",
      hairline: "#353535",
    },
  },

  {
    id: "concrete",
    name: "Concrete",
    blurb: "Warm greys and ochre. Same rigour, softer voice.",
    light: {
      background: "#E7E4DD",
      surface: "#F5F3EE",
      text: "#22221E",
      primary: "#96631A",
      primaryForeground: "#F5F3EE",
      accent: "#3F5A52",
      accentForeground: "#F5F3EE",
      muted: "#D8D4CA",
      mutedForeground: "#5E5C53",
      rule: "#22221E",
      hairline: "#C3BFB3",
    },
    dark: {
      background: "#171714",
      surface: "#20201C",
      text: "#EAE7DF",
      primary: "#D9A44A",
      primaryForeground: "#171714",
      accent: "#82A99C",
      accentForeground: "#171714",
      muted: "#2B2B26",
      mutedForeground: "#A29E93",
      rule: "#EAE7DF",
      hairline: "#3C3B34",
    },
  },

  {
    id: "signal",
    name: "Signal",
    blurb: "High-visibility orange on stark white. Industrial.",
    light: {
      background: "#F4F4F3",
      surface: "#FFFFFF",
      text: "#141414",
      primary: "#E24E1B",
      primaryForeground: "#141414",
      accent: "#1A1A1A",
      accentForeground: "#FFFFFF",
      muted: "#E4E4E2",
      mutedForeground: "#5A5A58",
      rule: "#141414",
      hairline: "#CCCCC9",
    },
    dark: {
      background: "#101010",
      surface: "#191919",
      text: "#F2F2F0",
      primary: "#FF7038",
      primaryForeground: "#101010",
      accent: "#F2F2F0",
      accentForeground: "#101010",
      muted: "#242423",
      mutedForeground: "#9C9C99",
      rule: "#F2F2F0",
      hairline: "#343433",
    },
  },

  {
    id: "verdigris",
    name: "Verdigris",
    blurb: "Deep green and copper on cool paper.",
    light: {
      background: "#ECF0EC",
      surface: "#F9FBF8",
      text: "#101610",
      primary: "#1F5D3F",
      primaryForeground: "#F9FBF8",
      accent: "#B2612C",
      accentForeground: "#F9FBF8",
      muted: "#DCE3DC",
      mutedForeground: "#4F5A4F",
      rule: "#101610",
      hairline: "#C3CDC3",
    },
    dark: {
      background: "#0C120E",
      surface: "#141C16",
      text: "#E7EDE6",
      primary: "#4FA277",
      primaryForeground: "#0C120E",
      accent: "#DB9160",
      accentForeground: "#0C120E",
      muted: "#1D2820",
      mutedForeground: "#95A296",
      rule: "#E7EDE6",
      hairline: "#2A3A2E",
    },
  },

  {
    id: "oxblood",
    name: "Oxblood",
    blurb: "Bone paper, deep red, brass. Quietly formal.",
    light: {
      background: "#F2EDE7",
      surface: "#FCF9F5",
      text: "#17100F",
      primary: "#7A1F24",
      primaryForeground: "#FCF9F5",
      accent: "#8A6A25",
      accentForeground: "#FCF9F5",
      muted: "#E4DBD1",
      mutedForeground: "#5E534E",
      rule: "#17100F",
      hairline: "#CDC2B6",
    },
    dark: {
      background: "#130E0D",
      surface: "#1C1615",
      text: "#EFE8E2",
      primary: "#C4636A",
      primaryForeground: "#130E0D",
      accent: "#CFA85C",
      accentForeground: "#130E0D",
      muted: "#282020",
      mutedForeground: "#A3968E",
      rule: "#EFE8E2",
      hairline: "#3A302E",
    },
  },

  {
    id: "monolith",
    name: "Monolith",
    blurb: "Pure black and white. Nothing to hide behind.",
    light: {
      background: "#FFFFFF",
      surface: "#FFFFFF",
      text: "#000000",
      primary: "#000000",
      primaryForeground: "#FFFFFF",
      accent: "#565656",
      accentForeground: "#FFFFFF",
      muted: "#EDEDED",
      mutedForeground: "#565656",
      rule: "#000000",
      hairline: "#C4C4C4",
    },
    dark: {
      background: "#000000",
      surface: "#0B0B0B",
      text: "#FFFFFF",
      primary: "#FFFFFF",
      primaryForeground: "#000000",
      accent: "#A8A8A8",
      accentForeground: "#000000",
      muted: "#1C1C1C",
      mutedForeground: "#A8A8A8",
      rule: "#FFFFFF",
      hairline: "#333333",
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = "ink";

export function getPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

// Heading faces. The new language wants a grotesque with real weight at the
// top end — Archivo is the default because its Black weight holds a tight
// negative track without falling apart, which is what the display type needs.
// Outfit is here because it's the geometric face the Bauhaus reference calls
// for; the serifs stay for anyone who wants the structure without the shout.
export type HeadingFont =
  | "archivo"
  | "outfit"
  | "space-grotesk"
  | "sora"
  | "libre-franklin"
  | "fraunces"
  | "dm-serif-display";
export type BodyFont = "inter" | "manrope";
export type FontSize = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";
export type MotionLevel = "full" | "reduced";

export interface ThemeSettings {
  palette: PaletteId;
  mode: "light" | "dark" | "system";
  headingFont: HeadingFont;
  bodyFont: BodyFont;
  fontSize: FontSize;
  density: Density;
  motion: MotionLevel;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  palette: DEFAULT_PALETTE_ID,
  mode: "system",
  headingFont: "archivo",
  bodyFont: "inter",
  fontSize: "md",
  density: "comfortable",
  motion: "full",
};

// Old palette ids that no longer exist. Anyone whose saved preference points at
// one of these (every existing account, since the whole set was replaced) gets
// mapped onto the nearest new theme rather than silently snapping to the
// default — a burgundy user lands on Oxblood, a navy user on Blueprint, etc.
const LEGACY_PALETTE_MAP: Record<string, PaletteId> = {
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

const LEGACY_HEADING_FONTS = new Set<string>([
  "archivo",
  "outfit",
  "space-grotesk",
  "sora",
  "libre-franklin",
  "fraunces",
  "dm-serif-display",
]);

/**
 * Normalises a stored ThemeSettings blob (from the database or localStorage)
 * onto the current option set. Called on every read so a saved preference
 * written before the redesign can never render a theme that no longer exists.
 */
export function normalizeThemeSettings(
  stored: Partial<ThemeSettings> | null | undefined
): ThemeSettings {
  const merged = { ...DEFAULT_THEME_SETTINGS, ...(stored ?? {}) };

  const paletteExists = PALETTES.some((p) => p.id === merged.palette);
  if (!paletteExists) {
    merged.palette =
      LEGACY_PALETTE_MAP[merged.palette as string] ?? DEFAULT_PALETTE_ID;
  }

  if (!LEGACY_HEADING_FONTS.has(merged.headingFont as string)) {
    merged.headingFont = DEFAULT_THEME_SETTINGS.headingFont;
  }

  return merged;
}
