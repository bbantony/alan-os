import { EmptyState } from "@/components/empty-state";
import { ComingSoonIllustration } from "@/components/illustrations";

export function ModulePlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <EmptyState
        title={title}
        description={`This module arrives in ${phase}.`}
        icon={<ComingSoonIllustration className="size-8" />}
      />
    </div>
  );
}
