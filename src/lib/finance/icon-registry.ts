import {
  ShoppingCart,
  UtensilsCrossed,
  Popcorn,
  Home,
  Zap,
  Car,
  Repeat,
  HeartPulse,
  Send,
  Briefcase,
  Disc3,
  MoreHorizontal,
  Landmark,
  CircleDollarSign,
  Gift,
  Plane,
  GraduationCap,
  PawPrint,
  type LucideIcon,
} from "lucide-react";

export const FINANCE_ICONS: Record<string, LucideIcon> = {
  ShoppingCart,
  UtensilsCrossed,
  Popcorn,
  Home,
  Zap,
  Car,
  Repeat,
  HeartPulse,
  Send,
  Briefcase,
  Disc3,
  MoreHorizontal,
  Landmark,
  CircleDollarSign,
  Gift,
  Plane,
  GraduationCap,
  PawPrint,
};

export function getFinanceIcon(name: string): LucideIcon {
  return FINANCE_ICONS[name] ?? CircleDollarSign;
}

export const AVAILABLE_FINANCE_ICON_NAMES = Object.keys(FINANCE_ICONS);
