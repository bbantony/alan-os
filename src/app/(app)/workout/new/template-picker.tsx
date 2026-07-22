"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkoutTemplate, WorkoutType } from "@/lib/workout/types";

export function TemplatePicker({
  templates,
  type,
  onLoad,
}: {
  templates: WorkoutTemplate[];
  type: WorkoutType;
  onLoad: (template: WorkoutTemplate) => void;
}) {
  const matching = templates.filter((t) => t.type === type);
  const [selectedId, setSelectedId] = useState(matching[0]?.id ?? "");

  // matching is recomputed every render from `templates`/`type`, but this
  // component stays mounted across type switches — selectedId can therefore
  // point at a template no longer in `matching` (or still be "" even once
  // templates for the new type exist), which made hitting Load silently do
  // nothing. Derive the value actually used at render time instead of trying
  // to keep selectedId in sync via an effect.
  const effectiveSelectedId = matching.some((t) => t.id === selectedId)
    ? selectedId
    : matching[0]?.id ?? "";

  if (matching.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
      <select
        value={effectiveSelectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        {matching.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const template = matching.find((t) => t.id === effectiveSelectedId);
          if (template) onLoad(template);
        }}
      >
        Load
      </Button>
    </div>
  );
}
