"use client";

import { useState, useTransition } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { PALETTES } from "@/lib/palettes";
import type { HeadingFont, FontSize, Density } from "@/lib/palettes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveThemeSettings } from "../actions";

const HEADING_FONTS: { id: HeadingFont; label: string }[] = [
  { id: "space-grotesk", label: "Space Grotesk" },
  { id: "archivo", label: "Archivo" },
  { id: "fraunces", label: "Fraunces" },
];

const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: "sm", label: "S" },
  { id: "md", label: "M" },
  { id: "lg", label: "L" },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
];

export function AppearanceEditor() {
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await saveThemeSettings(theme);
      setSaved(true);
    });
  }

  return (
    <div className="max-w-lg space-y-8">
      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Palette
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PALETTES.map((p) => {
            const active = theme.palette === p.id;
            const colors = theme.mode === "dark" ? p.dark : p.light;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setTheme({ palette: p.id })}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary ring-2 ring-primary/30" : "border-border"
                )}
              >
                <span
                  className="flex h-10 w-full overflow-hidden rounded-lg"
                  style={{ background: colors.background }}
                >
                  <span className="h-full w-1/2" style={{ background: colors.primary }} />
                  <span className="h-full w-1/2" style={{ background: colors.accent }} />
                </span>
                <span className="text-xs font-medium">{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Mode
        </h2>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={theme.mode === mode ? "default" : "outline"}
              onClick={() => setTheme({ mode })}
              className="capitalize"
            >
              {mode}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Heading font
        </h2>
        <div className="flex flex-wrap gap-2">
          {HEADING_FONTS.map((f) => (
            <Button
              key={f.id}
              type="button"
              variant={theme.headingFont === f.id ? "default" : "outline"}
              onClick={() => setTheme({ headingFont: f.id })}
              style={{ fontFamily: `var(--font-${f.id})` }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Text size
        </h2>
        <div className="flex gap-2">
          {FONT_SIZES.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={theme.fontSize === s.id ? "default" : "outline"}
              onClick={() => setTheme({ fontSize: s.id })}
              size="icon"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Density
        </h2>
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant={theme.density === d.id ? "default" : "outline"}
              onClick={() => setTheme({ density: d.id })}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
      </div>
    </div>
  );
}
