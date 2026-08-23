import type { SVGProps } from "react";

// Hand-drawn line illustrations in the app's Swiss/BRG style. All strokes use
// currentColor so they inherit the active palette/theme instantly — no
// baked-in hex values — which is what lets these stay correct when the
// owner switches palettes or light/dark mode in Settings -> Appearance.
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function ShoppingIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M10 16h28l-2.5 20a2 2 0 0 1-2 1.8H14.5a2 2 0 0 1-2-1.8L10 16Z" />
      <path d="M16 16v-3a8 8 0 0 1 16 0v3" />
      <path d="M14 24h20" />
    </svg>
  );
}

export function TasksIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="7" width="30" height="35" rx="2.5" />
      <path d="M17 5v6M31 5v6" />
      <path d="M15 21l3 3 6-6" />
      <path d="M27 22h9" />
      <path d="M15 32h17" />
    </svg>
  );
}

export function WorkoutIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 24h4M38 24h4" />
      <path d="M10 17v14M38 17v14" />
      <path d="M14 24h20" />
      <path d="M14 20v8M34 20v8" />
    </svg>
  );
}
