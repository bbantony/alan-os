"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";

export function QuickCaptureButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.2 }}
        className="fixed right-4 bottom-20 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:right-8 md:bottom-8"
        aria-label="Quick capture"
      >
        <Plus className="size-6" />
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick capture</DialogTitle>
          </DialogHeader>
          <EmptyState
            title="Coming soon"
            description="Quick capture will let you type or speak things like 'spent 12 at Tim Hortons, remind me to call mom Saturday' and turn it into real entries. It ships in a later phase."
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
