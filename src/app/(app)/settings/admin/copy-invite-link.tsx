"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyInviteLink({ inviteCode, signupPath }: { inviteCode: string; signupPath: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const message = `Join my Alan OS crew! Sign up at ${origin}${signupPath} — invite code: ${inviteCode}`;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border-2 border-rule bg-surface p-4">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Invite code</p>
      <p className="mb-3 font-heading text-lg font-semibold tracking-wide">{inviteCode || "Not set"}</p>
      <Button type="button" className="w-full gap-1.5" onClick={handleCopy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied!" : "Copy invite message"}
      </Button>
    </div>
  );
}
