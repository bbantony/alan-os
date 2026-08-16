"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { PALETTES } from "@/lib/palettes";
import type {
  Palette,
  PaletteColors,
  HeadingFont,
  BodyFont,
  FontSize,
  Density,
  MotionLevel,
} from "@/lib/palettes";
import { Button } from "@/components/ui/button";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { saveThemeSettings } from "../actions";

const HEADING_FONTS: { id: HeadingFont; label: string }[] = [
  { id: "archivo", label: "Archivo" },
  { id: "outfit", label: "Outfit" },
  { id: "space-grotesk", label: "Space Grotesk" },
  { id: "sora", label: "Sora" },
  { id: "libre-franklin", label: "Libre Franklin" },
  { id: "fraunces", label: "Fraunces" },
  { id: "dm-serif-display", label: "DM Serif" },
];

const BODY_FONTS: { id: BodyFont; label: string }[] = [
  { id: "inter", label: "Inter" },
  { id: "manrope", label: "Manrope" },
];

const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
];

const MOTION_LEVELS: { id: MotionLevel; label: string; description: string }[] = [
  {
    id: "full",
    label: "Full",
    description: "Page transitions, list animations, everything.",
  },
  {
    id: "reduced",
    label: "Reduced",
    description: "Minimal motion — for a calmer feel or motion sensitivity.",
  },
];

/**
 * A miniature of the actual app, drawn in a palette's own colours.
 *
 * The old picker showed two flat colour bars, which told you a theme's hues
 * but nothing about how it would feel — and in a language this structural,
 * how the rule reads against the ground matters more than the accent does.
 * This renders the real thing in miniature: a framed panel, a heavy rule, an
 * inverted block, a filled meter and a line of body text.
 */
function PalettePreview({ colors }: { colors: PaletteColors }) {
  return (
    <span
      className="block w-full p-2"
      style={{ background: colors.background }}
      aria-hidden="true"
    >
      <span
        className="block border-2"
        style={{ borderColor: colors.rule, background: colors.surface }}
      >
        {/* header strip */}
        <span
          className="flex items-center justify-between border-b-2 px-1.5 py-1"
          style={{ borderColor: colors.rule }}
        >
          <span
            className="block h-1.5 w-8"
            style={{ background: colors.mutedForeground }}
          />
          <span className="block size-1.5" style={{ background: colors.primary }} />
        </span>
        {/* an inverted stat block */}
        <span className="block px-1.5 py-1.5" style={{ background: colors.text }}>
          <span
            className="block h-1 w-6"
            style={{ background: colors.background, opacity: 0.5 }}
          />
          <span
            className="mt-1 block h-2.5 w-12"
            style={{ background: colors.background }}
          />
        </span>
        {/* a meter */}
        <span
          className="block border-t-2 px-1.5 py-1.5"
          style={{ borderColor: colors.rule }}
        >
          <span
            className="block h-1.5 w-full border"
            style={{ borderColor: colors.rule }}
          >
            <span
              className="block h-full"
              style={{ background: colors.primary, width: "62%" }}
            />
          </span>
          <span className="mt-1.5 flex gap-1">
            <span
              className="block h-1 flex-1"
              style={{ background: colors.hairline }}
            />
            <span className="block h-1 w-4" style={{ background: colors.accent }} />
          </span>
        </span>
      </span>
    </span>
  );
}

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

  // Which variant to preview. On "system" we can't know without reading the
  // media query, so previews show light — the same choice the app itself makes
  // on a device with no stated preference.
  const previewDark = theme.mode === "dark";
  const variantOf = (p: Palette) => (previewDark ? p.dark : p.light);

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Mode ---------------- */}
      <Panel>
        <PanelHead title="Light or dark" />
        <div className="p-3">
          <Segmented
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "Auto" },
            ]}
            value={theme.mode}
            onChange={(mode) => setTheme({ mode: mode as typeof theme.mode })}
          />
          <p className="micro-sm mt-2 text-muted-foreground">
            Auto follows your phone&apos;s own setting.
          </p>
        </div>
      </Panel>

      {/* ---------------- Theme ---------------- */}
      <Panel>
        <PanelHead title="Theme" count={PALETTES.length} />
        <div className="grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2">
          {PALETTES.map((p) => {
            const active = theme.palette === p.id;
            const colors = variantOf(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setTheme({ palette: p.id })}
                aria-pressed={active}
                className={cn(
                  "tap-press flex flex-col text-left transition-colors",
                  active ? "bg-foreground text-background" : "bg-surface hover:bg-muted"
                )}
              >
                <PalettePreview colors={colors} />
                <span className="flex items-start justify-between gap-2 px-3 pb-3">
                  <span className="min-w-0">
                    <span className="display-sm block truncate">{p.name}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs leading-snug",
                        active ? "text-background/70" : "text-muted-foreground"
                      )}
                    >
                      {p.blurb}
                    </span>
                  </span>
                  {active && (
                    <span className="flex size-5 shrink-0 items-center justify-center border-2 border-background">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- Heading font ---------------- */}
      <Panel>
        <PanelHead title="Heading font" />
        <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3">
          {HEADING_FONTS.map((f) => {
            const active = theme.headingFont === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTheme({ headingFont: f.id })}
                aria-pressed={active}
                className={cn(
                  "tap-press flex flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors",
                  active ? "bg-foreground text-background" : "bg-surface hover:bg-muted"
                )}
              >
                {/* Each option is set in its own face, at display weight, so
                    you're choosing by looking rather than by reading a name. */}
                <span
                  className="text-xl leading-tight font-extrabold tracking-[-0.03em] uppercase"
                  style={{ fontFamily: `var(--font-${f.id})` }}
                >
                  Aa
                </span>
                <span
                  className={cn(
                    "micro-sm truncate",
                    active ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- Body font ---------------- */}
      <Panel>
        <PanelHead title="Body font" />
        <div className="grid grid-cols-2 gap-px bg-hairline">
          {BODY_FONTS.map((f) => {
            const active = theme.bodyFont === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTheme({ bodyFont: f.id })}
                aria-pressed={active}
                className={cn(
                  "tap-press flex flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors",
                  active ? "bg-foreground text-background" : "bg-surface hover:bg-muted"
                )}
              >
                <span className="text-sm" style={{ fontFamily: `var(--font-${f.id})` }}>
                  The quick brown fox
                </span>
                <span
                  className={cn(
                    "micro-sm",
                    active ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- Size & density ---------------- */}
      <Panel>
        <PanelHead title="Text size" />
        <div className="p-3">
          <Segmented
            options={FONT_SIZES.map((s) => ({ value: s.id, label: s.label }))}
            value={theme.fontSize}
            onChange={(id) => setTheme({ fontSize: id })}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Spacing" />
        <div className="p-3">
          <Segmented
            options={DENSITIES.map((d) => ({ value: d.id, label: d.label }))}
            value={theme.density}
            onChange={(id) => setTheme({ density: id })}
          />
        </div>
      </Panel>

      {/* ---------------- Motion ---------------- */}
      <Panel>
        <PanelHead title="Motion" />
        <div className="grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2">
          {MOTION_LEVELS.map((m) => {
            const active = theme.motion === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setTheme({ motion: m.id })}
                aria-pressed={active}
                className={cn(
                  "tap-press flex flex-col gap-1 px-3 py-3 text-left transition-colors",
                  active ? "bg-foreground text-background" : "bg-surface hover:bg-muted"
                )}
              >
                <span className="micro">{m.label}</span>
                <span
                  className={cn(
                    "text-xs leading-snug",
                    active ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  {m.description}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Changes apply live as you tap; Save is what makes them stick across
          devices. Saying so removes the "did that work?" beat. */}
      <div className="flex items-center gap-3 border-2 border-rule bg-muted/40 p-3">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <p className="micro-sm text-muted-foreground">
          {saved ? "Saved to your account." : "Changes preview instantly — save to keep them."}
        </p>
      </div>
    </div>
  );
}
