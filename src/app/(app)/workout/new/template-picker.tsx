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

  if (matching.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
      <select
        value={selectedId}
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
          const template = matching.find((t) => t.id === selectedId);
          if (template) onLoad(template);
        }}
      >
        Load
      </Button>
    </div>
  );
}
