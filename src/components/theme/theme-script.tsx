import { DEFAULT_THEME_SETTINGS } from "@/lib/palettes";

const STORAGE_KEY = "alan-os-theme";

// Runs before hydration so the correct palette/mode/fonts/density are applied
// on first paint (no flash of default theme).
const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var t = stored ? JSON.parse(stored) : ${JSON.stringify(DEFAULT_THEME_SETTINGS)};
    var root = document.documentElement;
    var isDark =
      t.mode === "dark" ||
      (t.mode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", isDark);
    root.setAttribute("data-palette", t.palette);
    root.setAttribute("data-heading-font", t.headingFont);
    root.setAttribute("data-font-size", t.fontSize);
    root.setAttribute("data-density", t.density);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export const THEME_STORAGE_KEY = STORAGE_KEY;
