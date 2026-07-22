import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { AppShell } from "@/components/nav/app-shell";
import { ThemeProvider } from "@/components/theme/theme-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <ThemeProvider initialTheme={profile.themeSettings}>
      <AppShell moduleAccess={profile.moduleAccess}>{children}</AppShell>
    </ThemeProvider>
  );
}
