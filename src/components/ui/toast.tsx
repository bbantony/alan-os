"use client";

import { Toaster as SonnerToaster } from "sonner";

// Palette-aware wrapper around sonner — reads this app's own CSS variables
// (already theme/dark-mode aware via ThemeProvider) instead of sonner's
// default styling, so a toast never looks like a foreign component bolted on.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: "var(--surface)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          fontSize: "0.875rem",
        },
        classNames: {
          title: "font-medium",
        },
      }}
      icons={{}}
    />
  );
}

export { toast } from "sonner";
