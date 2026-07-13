export type PaletteId =
  | "british-racing-green"
  | "navy-cream"
  | "burgundy-sand"
  | "charcoal-ice"
  | "forest-moss"
  | "terracotta-bone";

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
  border: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  light: PaletteColors;
  dark: PaletteColors;
}

export const PALETTES: Palette[] = [
  {
    id: "british-racing-green",
    name: "British Racing Green",
    light: {
      background: "#FAF7F2",
      surface: "#FFFFFF",
      text: "#14140F",
      primary: "#004225",
      primaryForeground: "#FAF7F2",
      accent: "#C1662F",
      accentForeground: "#FAF7F2",
      muted: "#EFE9DE",
      mutedForeground: "#5B5C51",
      border: "#E2DACB",
    },
    dark: {
      background: "#0B120E",
      surface: "#121A15",
      text: "#F3F1E9",
      primary: "#2E7D52",
      primaryForeground: "#0B120E",
      accent: "#D98A50",
      accentForeground: "#0B120E",
      muted: "#1B241D",
      mutedForeground: "#9CA69B",
      border: "#233028",
    },
  },
  {
    id: "navy-cream",
    name: "Navy / Cream",
    light: {
      background: "#FAF6EC",
      surface: "#FFFFFF",
      text: "#161A24",
      primary: "#1B2A4A",
      primaryForeground: "#FAF6EC",
      accent: "#D9A441",
      accentForeground: "#161A24",
      muted: "#EFE7D3",
      mutedForeground: "#5B5F6B",
      border: "#E1D7BC",
    },
    dark: {
      background: "#0B0E16",
      surface: "#121728",
      text: "#F2EFE3",
      primary: "#4A6491",
      primaryForeground: "#0B0E16",
      accent: "#E0B15C",
      accentForeground: "#0B0E16",
      muted: "#1A2032",
      mutedForeground: "#9AA0AE",
      border: "#232B41",
    },
  },
  {
    id: "burgundy-sand",
    name: "Burgundy / Sand",
    light: {
      background: "#F7EFE3",
      surface: "#FFFFFF",
      text: "#1E1416",
      primary: "#6B1E2B",
      primaryForeground: "#F7EFE3",
      accent: "#C99A5B",
      accentForeground: "#1E1416",
      muted: "#EEE1CB",
      mutedForeground: "#645449",
      border: "#E2CFA9",
    },
    dark: {
      background: "#150B0D",
      surface: "#1E1215",
      text: "#F5ECE0",
      primary: "#9C4655",
      primaryForeground: "#150B0D",
      accent: "#D4AD70",
      accentForeground: "#150B0D",
      muted: "#271A1D",
      mutedForeground: "#AE9A8E",
      border: "#33242A",
    },
  },
  {
    id: "charcoal-ice",
    name: "Charcoal / Ice",
    light: {
      background: "#F3F6F8",
      surface: "#FFFFFF",
      text: "#171A1C",
      primary: "#2B2E33",
      primaryForeground: "#F3F6F8",
      accent: "#5FA8D3",
      accentForeground: "#0E1216",
      muted: "#E6EBEF",
      mutedForeground: "#565D64",
      border: "#D8E0E6",
    },
    dark: {
      background: "#0D0F11",
      surface: "#16191C",
      text: "#EDF1F4",
      primary: "#9AA0A8",
      primaryForeground: "#0D0F11",
      accent: "#7EC1E8",
      accentForeground: "#0D0F11",
      muted: "#1D2124",
      mutedForeground: "#9BA3AA",
      border: "#262B2F",
    },
  },
  {
    id: "forest-moss",
    name: "Forest / Moss",
    light: {
      background: "#F5F3EA",
      surface: "#FFFFFF",
      text: "#16190F",
      primary: "#2F4F3E",
      primaryForeground: "#F5F3EA",
      accent: "#8A9A5B",
      accentForeground: "#16190F",
      muted: "#E9E6D6",
      mutedForeground: "#5B5F4D",
      border: "#DCD7BE",
    },
    dark: {
      background: "#0C1210",
      surface: "#141C17",
      text: "#F0F1E6",
      primary: "#5C8069",
      primaryForeground: "#0C1210",
      accent: "#A3B478",
      accentForeground: "#0C1210",
      muted: "#1C2620",
      mutedForeground: "#9AA491",
      border: "#25302A",
    },
  },
  {
    id: "terracotta-bone",
    name: "Terracotta / Bone",
    light: {
      background: "#F6F1EA",
      surface: "#FFFFFF",
      text: "#1B1613",
      primary: "#A64B2A",
      primaryForeground: "#F6F1EA",
      accent: "#1F6F6B",
      accentForeground: "#F6F1EA",
      muted: "#ECE2D5",
      mutedForeground: "#63584F",
      border: "#DFD0BE",
    },
    dark: {
      background: "#140F0C",
      surface: "#1D1613",
      text: "#F4ECE3",
      primary: "#C97A54",
      primaryForeground: "#140F0C",
      accent: "#4FA39E",
      accentForeground: "#140F0C",
      muted: "#271E19",
      mutedForeground: "#AB9C8F",
      border: "#33261F",
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = "british-racing-green";

export function getPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export type HeadingFont = "space-grotesk" | "archivo" | "fraunces";
export type FontSize = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";

export interface ThemeSettings {
  palette: PaletteId;
  mode: "light" | "dark" | "system";
  headingFont: HeadingFont;
  fontSize: FontSize;
  density: Density;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  palette: DEFAULT_PALETTE_ID,
  mode: "system",
  headingFont: "space-grotesk",
  fontSize: "md",
  density: "comfortable",
};
