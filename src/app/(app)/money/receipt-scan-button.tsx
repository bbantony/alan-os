"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { uploadReceipt, getReceipt } from "./receipt-actions";
import type { Receipt } from "@/lib/finance/types";

export function ReceiptScanButton({ onUploaded }: { onUploaded: (receipt: Receipt) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadReceipt(formData);
    if (result.error || !result.receiptId) {
      setUploading(false);
      setError(result.error ?? "Couldn't process that photo.");
      return;
    }
    const receipt = await getReceipt(result.receiptId);
    setUploading(false);
    if (receipt) onUploaded(receipt);
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="tap-press flex items-center gap-1.5 text-xs font-medium text-primary disabled:opacity-50"
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        {uploading ? "Reading receipt…" : "Scan receipt"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
