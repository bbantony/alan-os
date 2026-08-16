"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createCrew, deleteCrew, renameCrew, type AdminCrewRow } from "./actions";

export function AdminCrews({ initialCrews }: { initialCrews: AdminCrewRow[] }) {
  const [crews, setCrews] = useState(initialCrews);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const result = await createCrew(trimmed);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewName("");
    setCrews((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed, member_count: 0, created_at: new Date().toISOString() }]);
    toast.success(`"${trimmed}" created`);
  }

  function startRename(crew: AdminCrewRow) {
    setRenamingId(crew.id);
    setRenameValue(crew.name);
  }

  async function saveRename(id: string) {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    setCrews((prev) => prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    await renameCrew({ id, name: trimmed });
  }

  async function handleDelete(id: string) {
    setError(null);
    const result = await deleteCrew(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCrews((prev) => prev.filter((c) => c.id !== id));
    toast.success("Crew deleted");
  }

  return (
    <div>
      <h2 className="mb-2 micro text-muted-foreground">Crews</h2>
      <ul className="mb-3 divide-y divide-hairline border-2 border-rule bg-surface">
        {crews.map((crew) => (
          <li key={crew.id} className="flex items-center gap-3 px-4 py-3">
            {renamingId === crew.id ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => saveRename(crew.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(crew.id);
                }}
                className="h-8 flex-1"
              />
            ) : (
              <button onClick={() => startRename(crew)} className="flex-1 text-left text-sm font-medium">
                {crew.name}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {crew.member_count} member{crew.member_count === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => handleDelete(crew.id)}
              className="tap-press text-muted-foreground/40 hover:text-destructive"
              aria-label={`Delete ${crew.name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {crews.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No crews yet.</li>}
      </ul>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New crew name…" className="flex-1" />
        <Button type="submit" size="icon" disabled={saving || !newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
