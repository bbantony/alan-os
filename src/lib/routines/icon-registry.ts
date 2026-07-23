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

export const ROUTINE_ICONS: Record<string, LucideIcon> = {
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
  return ROUTINE_ICONS[name] ?? Repeat;
}

export const AVAILABLE_ROUTINE_ICON_NAMES = Object.keys(ROUTINE_ICONS);
