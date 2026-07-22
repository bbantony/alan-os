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

export function SunriseIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 30h36" />
      <path d="M12 30a12 12 0 0 1 24 0" />
      <path d="M24 10v5M11 17l3.5 3.5M37 17l-3.5 3.5" />
      <path d="M4 37h40" />
    </svg>
  );
}

export function ComingSoonIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="24" cy="24" r="16" />
      <path d="M24 15v9l6 4" />
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

export function AuthIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="21" width="24" height="18" rx="2.5" />
      <path d="M17 21v-6a7 7 0 0 1 14 0v6" />
      <circle cx="24" cy="29" r="2" />
      <path d="M24 31v3" />
    </svg>
  );
}
