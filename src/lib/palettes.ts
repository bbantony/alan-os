export type PaletteId =
  | "british-racing-green"
  | "navy-cream"
  | "burgundy-sand"
  | "charcoal-ice"
  | "forest-moss"
  | "terracotta-bone"
  | "teal-mist"
  | "plum-blush"
  | "amber-ink"
  | "rose-linen"
  | "mono-graphite";

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
  {
    id: "teal-mist",
    name: "Teal / Mist",
    light: {
      background: "#F2F7F6",
      surface: "#FFFFFF",
      text: "#10201D",
      primary: "#0B6E6E",
      primaryForeground: "#F2F7F6",
      accent: "#D98A3D",
      accentForeground: "#10201D",
      muted: "#E3EEEC",
      mutedForeground: "#52645F",
      border: "#D3E1DE",
    },
    dark: {
      background: "#0A1514",
      surface: "#0F1E1C",
      text: "#EAF3F1",
      primary: "#3FA8A0",
      primaryForeground: "#0A1514",
      accent: "#E3A25F",
      accentForeground: "#0A1514",
      muted: "#16302C",
      mutedForeground: "#8FA6A0",
      border: "#1E3B36",
    },
  },
  {
    id: "plum-blush",
    name: "Plum / Blush",
    light: {
      background: "#F8F1F3",
      surface: "#FFFFFF",
      text: "#241419",
      primary: "#5E2A4D",
      primaryForeground: "#F8F1F3",
      accent: "#C98A5B",
      accentForeground: "#241419",
      muted: "#EFE1E6",
      mutedForeground: "#6B5560",
      border: "#E3D0D8",
    },
    dark: {
      background: "#140B10",
      surface: "#1E1218",
      text: "#F5EAEF",
      primary: "#9C5C82",
      primaryForeground: "#140B10",
      accent: "#D4A374",
      accentForeground: "#140B10",
      muted: "#271A21",
      mutedForeground: "#AB93A0",
      border: "#33232B",
    },
  },
  {
    id: "amber-ink",
    name: "Amber / Ink",
    light: {
      background: "#FBF6E9",
      surface: "#FFFFFF",
      text: "#1E1708",
      primary: "#8A5A00",
      primaryForeground: "#FBF6E9",
      accent: "#2F6F5E",
      accentForeground: "#FBF6E9",
      muted: "#F0E6CC",
      mutedForeground: "#6B5F42",
      border: "#E3D6AE",
    },
    dark: {
      background: "#120E04",
      surface: "#1C1608",
      text: "#F5EFDD",
      primary: "#D9A02E",
      primaryForeground: "#120E04",
      accent: "#5FA893",
      accentForeground: "#120E04",
      muted: "#241C0C",
      mutedForeground: "#A99B77",
      border: "#2E2510",
    },
  },
  {
    id: "rose-linen",
    name: "Rose / Linen",
    light: {
      background: "#F9F1EC",
      surface: "#FFFFFF",
      text: "#241512",
      primary: "#8C3B3B",
      primaryForeground: "#F9F1EC",
      accent: "#4C7A6E",
      accentForeground: "#F9F1EC",
      muted: "#EFE0D6",
      mutedForeground: "#6B5750",
      border: "#E3D0C3",
    },
    dark: {
      background: "#160D0B",
      surface: "#201513",
      text: "#F5E9E3",
      primary: "#C97070",
      primaryForeground: "#160D0B",
      accent: "#6FA294",
      accentForeground: "#160D0B",
      muted: "#291B17",
      mutedForeground: "#AD968E",
      border: "#34211C",
    },
  },
  {
    id: "mono-graphite",
    name: "Mono / Graphite",
    light: {
      background: "#F5F5F3",
      surface: "#FFFFFF",
      text: "#141414",
      primary: "#1F1F1F",
      primaryForeground: "#F5F5F3",
      accent: "#B5472F",
      accentForeground: "#F5F5F3",
      muted: "#E7E7E4",
      mutedForeground: "#5C5C58",
      border: "#D9D9D5",
    },
    dark: {
      background: "#0C0C0B",
      surface: "#131313",
      text: "#F2F2EF",
      primary: "#D8D8D4",
      primaryForeground: "#0C0C0B",
      accent: "#E06A4D",
      accentForeground: "#0C0C0B",
      muted: "#1C1C1A",
      mutedForeground: "#9C9C97",
      border: "#262624",
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = "british-racing-green";

export function getPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export type HeadingFont =
  | "space-grotesk"
  | "archivo"
  | "fraunces"
  | "sora"
  | "libre-franklin"
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
  headingFont: "space-grotesk",
  bodyFont: "inter",
  fontSize: "md",
  density: "comfortable",
  motion: "full",
};
