import { cn } from "@/lib/utils";

/**
 * Circle, square, triangle in the three signal colours — the one piece of
 * literal Bauhaus iconography kept from the reference, because a mark is
 * exactly where that vocabulary belongs. (Scattering the same shapes over
 * every card as decoration is what the reference gets wrong for an app; using
 * them once, as identity, is what it gets right.)
 *
 * The shapes are drawn from theme tokens, so the mark restates whichever
 * palette is active instead of being three fixed colours pasted on top of it.
 */
export function Wordmark({
  showText = true,
  className,
}: {
  showText?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="block size-2.5 rounded-full bg-primary" />
        <span className="block size-2.5 bg-accent" />
        <span
          className="block size-2.5 bg-foreground"
          style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
        />
      </span>
      {showText && (
        <span className="font-heading text-sm font-extrabold tracking-[0.14em] uppercase">
          Alan OS
        </span>
      )}
    </span>
  );
}
