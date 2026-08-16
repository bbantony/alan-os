"use client";

import { Toaster as SonnerToaster } from "sonner";

// Palette-aware wrapper around sonner — reads this app's own CSS variables
// (already theme/dark-mode aware via ThemeProvider) instead of sonner's
// default styling, so a toast never looks like a foreign component bolted on.
//
// In the new language a toast is the same object as everything else: a square
// framed block on a hard shadow, with its title in the metadata register.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: "var(--surface)",
          color: "var(--foreground)",
          border: "var(--rule-w) solid var(--rule)",
          borderRadius: "0",
          boxShadow: "var(--shadow-hard-md)",
          fontSize: "0.875rem",
        },
        classNames: {
          title: "font-bold uppercase tracking-[0.06em] text-xs",
          description: "text-muted-foreground",
        },
      }}
      icons={{}}
    />
  );
}

export { toast } from "sonner";
