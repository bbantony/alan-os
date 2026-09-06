import {
  Repeat,
  Droplet,
  BookOpen,
  Dumbbell,
  Moon,
  Sun,
  Coffee,
  Brush,
  PenLine,
  Heart,
  Sparkles,
  Home,
  type LucideIcon,
} from "lucide-react";
// The names live in their own dependency-free file so non-React callers (the
// AI tools layer, `npm test`) can use them; typing the map against that union
// is what keeps the two lists identical — add an icon here without adding its
// name there and this file stops compiling.
import { ROUTINE_ICON_NAMES, type RoutineIconName } from "./icon-names";

export const ROUTINE_ICONS: Record<RoutineIconName, LucideIcon> = {
  Repeat,
  Droplet,
  BookOpen,
  Dumbbell,
  Moon,
  Sun,
  Coffee,
  Brush,
  PenLine,
  Heart,
  Sparkles,
  Home,
};

export function getRoutineIcon(name: string): LucideIcon {
  return ROUTINE_ICONS[name as RoutineIconName] ?? Repeat;
}

export const AVAILABLE_ROUTINE_ICON_NAMES: string[] = [...ROUTINE_ICON_NAMES];
