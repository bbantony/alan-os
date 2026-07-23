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
import { DEFAULT_THEME_SETTINGS, type ThemeSettings } from "@/lib/palettes";
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
    return { ...DEFAULT_THEME_SETTINGS, ...JSON.parse(stored) };
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
  const [theme, setThemeState] = useState<ThemeSettings>(() => ({
    ...readInitialTheme(),
    ...initialTheme,
  }));

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
