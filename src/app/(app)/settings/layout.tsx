import { getCurrentProfile } from "@/lib/supabase/profile";
import { getVisibleSettingsLinks } from "./settings-links";
import { SettingsNav } from "./settings-nav";

// Desktop gets a persistent sidebar (every settings sub-page benefits, not
// just the index) — mobile keeps exactly its existing full-page index as
// the only navigation, since there's no room for a permanent side rail.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const { accountLinks, moduleLinks, adminLink } = getVisibleSettingsLinks(profile);

  // Below md, this wrapper carries no classes at all — every child page keeps
  // its own existing "mx-auto max-w-lg px-4 py-8" exactly as before, so mobile
  // is completely unchanged. At md+, it becomes the two-column shell; the
  // child's own inner padding just adds a little extra breathing room next
  // to the sidebar rather than needing every sub-page's markup touched.
  return (
    <div className="md:mx-auto md:flex md:max-w-4xl md:items-start md:gap-10 md:px-4 md:pt-8">
      <SettingsNav
        accountLinks={accountLinks}
        moduleLinks={moduleLinks}
        adminLink={adminLink}
        className="hidden md:sticky md:top-8 md:block md:w-56 md:shrink-0"
      />
      <div className="min-w-0 md:flex-1">{children}</div>
    </div>
  );
}
