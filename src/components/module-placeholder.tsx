import { EmptyState } from "@/components/empty-state";

export function ModulePlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <EmptyState title={title} description={`This module arrives in ${phase}.`} />
    </div>
  );
}
