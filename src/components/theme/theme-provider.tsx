"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  type ThemeSettings,
} from "@/lib/palettes";
import { THEME_STORAGE_KEY } from "./theme-script";

interface ThemeContextValue {
  theme: ThemeSettings;
  setTheme: (next: Partial<ThemeSettings>) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME_SETTINGS;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) return DEFAULT_THEME_SETTINGS;
    return normalizeThemeSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

function applyThemeToDom(theme: ThemeSettings) {
  const root = document.documentElement;
  const isDark =
    theme.mode === "dark" ||
    (theme.mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-palette", theme.palette);
  root.setAttribute("data-heading-font", theme.headingFont);
  root.setAttribute("data-body-font", theme.bodyFont ?? "inter");
  root.setAttribute("data-font-size", theme.fontSize);
  root.setAttribute("data-density", theme.density);
  root.setAttribute("data-motion", theme.motion ?? "full");
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Partial<ThemeSettings>;
}) {
  const [theme, setThemeState] = useState<ThemeSettings>(() =>
    normalizeThemeSettings({ ...readInitialTheme(), ...initialTheme })
  );

  useEffect(() => {
    applyThemeToDom(theme);
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  const setTheme = useCallback((next: Partial<ThemeSettings>) => {
    setThemeState((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * "Is the interface dark right now" — for the handful of places that have to
 * pick a COLOUR IN JAVASCRIPT rather than in CSS, which today means chart
 * series and tooltips. Anything expressible as a CSS variable should use one
 * and never call this.
 *
 * There were two copies of this before, and they did not agree. The Money
 * reports version subscribed to the media query; the workout exercise-detail
 * version read `matchMedia` straight through during render, which meant two
 * defects at once: a chart that stayed in light colours when the phone flipped
 * to dark, and a value that differs between the server render (always false —
 * no `window`) and the first client render, which is a hydration mismatch. Its
 * comment claimed it matched the other one. It did the opposite.
 *
 * This version is the subscribing one. It starts false so server and client
 * agree on the first paint, then corrects in an effect — an imperceptible
 * flash on a chart colour is the right trade for never desynchronising.
 */
export function useIsDark(): boolean {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const compute = () =>
      setIsDark(theme.mode === "dark" || (theme.mode === "system" && media.matches));
    compute();
    media.addEventListener("change", compute);
    return () => media.removeEventListener("change", compute);
  }, [theme.mode]);

  return isDark;
}
