"use client";

import { useRef, useState } from "react";
import { Camera, Images, Loader2 } from "lucide-react";
import { uploadReceipt, getReceipt } from "./receipt-actions";
import { compressImage } from "@/lib/images";
import type { Receipt } from "@/lib/finance/types";

/**
 * Two ways in, because they're two different jobs.
 *
 * **Take photo** is the at-the-till case, and keeps `capture="environment"` so
 * the phone opens straight into the rear camera.
 *
 * **From gallery** is the pile-of-old-receipts case, which the button couldn't
 * do at all before: `capture` on an input is a *directive*, not a hint, so
 * Android went straight to the camera and there was no route to a photo taken
 * last month. It also accepts several at once and works through them in order,
 * so a backlog goes in one batch instead of one tap at a time. Each still gets
 * its own review screen, and the date on that screen is editable — an old
 * receipt files under the day it was actually spent, not today.
 */
export function ReceiptScanButton({ onUploaded }: { onUploaded: (receipt: Receipt) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploading = progress !== null;

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setProgress({ done: 0, total: files.length });
    setError(null);

    let failed = 0;
    for (const [index, file] of files.entries()) {
      // Wrapped per file so one unreadable photo out of eight doesn't abandon
      // the other seven — and so a failure can never leave the spinner up,
      // which is what used to happen when a too-large photo was rejected.
      try {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append("file", compressed);

        const result = await uploadReceipt(formData);
        if (result.error || !result.receiptId) {
          failed += 1;
        } else {
          const receipt = await getReceipt(result.receiptId);
          if (receipt) onUploaded(receipt);
          else failed += 1;
        }
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: files.length });
    }

    setProgress(null);
    if (failed > 0) {
      setError(
        files.length === 1
          ? "That photo didn't go through. Try again, or check your signal."
          : `${failed} of ${files.length} didn't go through. The rest are ready to review.`
      );
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    await handleFiles(files);
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {uploading ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {progress.total > 1
              ? `Reading ${progress.done + 1} of ${progress.total}…`
              : "Reading receipt…"}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="tap-press flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Camera className="size-3.5" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="tap-press flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Images className="size-3.5" />
              From gallery
            </button>
          </>
        )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="hidden"
      />

      {error && <p className="max-w-[24ch] text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
