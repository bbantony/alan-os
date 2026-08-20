"use client";

import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";

import { SettingsGroup, SettingRow } from "@/components/settings/setting-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  exportEverything,
  wipeModule,
  WIPE_LABELS,
  type WipeableModule,
} from "./data-actions";

const MODULES = Object.keys(WIPE_LABELS) as WipeableModule[];

const WIPE_NOTES: Record<WipeableModule, string> = {
  money: "Every transaction, receipt, budget, goal, debt and bank check. Your accounts and categories are kept — they're setup, not history.",
  plan: "Every task, routine, reminder and day plan.",
  shopping: "Your list and every purchase recorded from trips and receipts. Your categories are kept.",
  workout: "Every session, set, run and personal best. Your exercise list and templates for it are kept.",
  ai: "The weekly patterns it's found and the record of what it has cost. Doesn't touch anything it wrote into other parts of the app.",
};

export function DataSettings() {
  const [exporting, setExporting] = useState(false);
  const [wiping, setWiping] = useState<WipeableModule | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setExporting(true);
    const result = await exportEverything();
    setExporting(false);
    if (result.error || !result.json) {
      toast.error("Couldn't build the export.");
      return;
    }

    // Built in the browser and handed straight to the download, so the file
    // never becomes a URL that could be shared or cached anywhere.
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alan-os-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  }

  async function handleWipe() {
    if (!wiping) return;
    setPending(true);
    const result = await wipeModule({ module: wiping });
    setPending(false);
    if (result.error) {
      toast.error("Couldn't clear that.");
      return;
    }
    toast.success(`${WIPE_LABELS[wiping]} cleared`);
    setWiping(null);
    setConfirmText("");
  }

  return (
    <>
      <SettingsGroup
        title="Your data"
        description="Everything you've logged, in one file you can keep. Nothing about it needs this app to read it."
      >
        <SettingRow
          label="Download everything"
          hint="Money, training, tasks, shopping and the rest, as JSON."
          last
          control={
            <Button type="button" variant="outline" disabled={exporting} onClick={handleExport}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {exporting ? "Building…" : "Download"}
            </Button>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Start a section over"
        description="Clears one part of the app and leaves everything else alone. There is no undo, so take the download above first."
      >
        {MODULES.map((module, i) => (
          <div
            key={module}
            className={cn(
              "flex items-start justify-between gap-3 px-3 py-3",
              i < MODULES.length - 1 && "border-b border-hairline"
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{WIPE_LABELS[module]}</p>
              <Micro className="mt-0.5 block">{WIPE_NOTES[module]}</Micro>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="shrink-0"
              onClick={() => {
                setWiping(module);
                setConfirmText("");
              }}
            >
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        ))}
      </SettingsGroup>

      {/* A typed confirmation rather than the usual two-button dialog. Every
          other destructive action in this app deletes one thing; this deletes a
          year of it, and a tap you can make by accident isn't enough. */}
      <Dialog open={Boolean(wiping)} onOpenChange={(open) => !open && setWiping(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear {wiping ? WIPE_LABELS[wiping] : ""}?</DialogTitle>
            <DialogDescription>
              {wiping ? WIPE_NOTES[wiping] : ""} This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Micro>
              Type <span className="font-bold text-foreground">clear</span> to confirm.
            </Micro>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="clear"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWiping(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || confirmText.trim().toLowerCase() !== "clear"}
              onClick={handleWipe}
            >
              {pending ? "Clearing…" : "Clear it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
